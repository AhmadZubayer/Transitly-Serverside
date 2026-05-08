const { ObjectId } = require('mongodb');
const { paymentsColl, ticketsColl, usersColl, bookingsColl } = require('../config/database');

function paymentAPI(app, stripe) {

     // Create Stripe Checkout Session
     app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.totalPrice) * 100;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'bdt',
                            unit_amount: amount,
                            product_data: {
                                name: `${paymentInfo.ticketName} (Qty: ${paymentInfo.quantity})`
                            }
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: {
                    ticketId: paymentInfo.ticketId,
                    quantity: paymentInfo.quantity,
                    bookingId: paymentInfo.bookingId
                },
                customer_email: paymentInfo.senderEmail,
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
            })

            res.send({ url: session.url })
        })

     // Store Payment Data & Subtract Ticket Quantity
     app.post('/store-payment', async (req, res) => {
            try {
                const { userEmail, ticketId, quantity, totalPrice, stripeSessionId, bookingId } = req.body;

                const parsedQuantity = parseInt(quantity);
                const parsedTotalPrice = parseFloat(totalPrice);

                // Check if ticket exists and has enough quantity
                const ticket = await ticketsColl.findOne({ _id: new ObjectId(ticketId) });

                if (!ticket) {
                    return res.status(404).send({ error: "Ticket not found" });
                }

                if (ticket.quantity < parsedQuantity) {
                    return res.status(400).send({ error: "Not enough tickets available" });
                }

                // Subtract ticket quantity
                const ticketUpdateResult = await ticketsColl.updateOne(
                    { _id: new ObjectId(ticketId) },
                    { $inc: { quantity: -parsedQuantity } }
                );

                if (ticketUpdateResult.modifiedCount === 0) {
                    return res.status(500).send({ error: "Failed to update ticket quantity" });
                }

                // Update booking status to 'paid' if bookingId is provided
                if (bookingId && ObjectId.isValid(bookingId)) {
                    await bookingsColl.updateOne(
                        { _id: new ObjectId(bookingId) },
                        { $set: { status: 'paid', updatedAt: new Date() } }
                    );
                }

                // Revenue split: 70% vendor, 30% platform
                const vendorShare = Number((parsedTotalPrice * 0.7).toFixed(2));
                const platformShare = Number((parsedTotalPrice * 0.3).toFixed(2));

                // Store payment record
                const paymentData = {
                    userEmail,
                    ticketId: new ObjectId(ticketId),
                    bookingId: bookingId ? new ObjectId(bookingId) : null,
                    quantity: parsedQuantity,
                    totalPrice: parsedTotalPrice,
                    vendorEmail: ticket.vendorEmail || null,
                    vendorRevenue: vendorShare,
                    platformRevenue: platformShare,
                    stripeSessionId,
                    paymentDate: new Date(),
                    status: 'completed',
                    createdAt: new Date()
                };

                const result = await paymentsColl.insertOne(paymentData);

                console.log("Payment stored successfully:", result.insertedId);

                // Fetch the complete booking with ticket details for the response
                const completeBooking = await paymentsColl.aggregate([
                    { $match: { _id: result.insertedId } },
                    {
                        $lookup: {
                            from: 'tickets',
                            localField: 'ticketId',
                            foreignField: '_id',
                            as: 'ticket'
                        }
                    },
                    { $unwind: '$ticket' }
                ]).toArray();

                res.send({
                    success: true,
                    message: "Payment stored and ticket quantity updated successfully",
                    paymentId: result.insertedId,
                    booking: completeBooking[0]
                });
            } catch (error) {
                console.error("Payment storage error:", error);
                res.status(500).send({ error: "Failed to store payment" });
            }
        })

     // Vendor analytics (revenue/sold/added) - last N days
     app.get('/vendor-analytics/:email', async (req, res) => {
            try {
                const { email } = req.params;
                const days = Number(req.query.days || 30);
                const start = new Date();
                start.setDate(start.getDate() - (Number.isFinite(days) ? days : 30));

                // Payments aggregated by day for this vendor
                const paymentAgg = await paymentsColl
                    .aggregate([
                        {
                            $lookup: {
                                from: 'tickets',
                                localField: 'ticketId',
                                foreignField: '_id',
                                as: 'ticket'
                            }
                        },
                        { $unwind: { path: '$ticket', preserveNullAndEmptyArrays: true } },
                        {
                            $addFields: {
                                vendorEmailResolved: { $ifNull: ['$vendorEmail', '$ticket.vendorEmail'] }
                            }
                        },
                        {
                            $match: {
                                vendorEmailResolved: email,
                                paymentDate: { $gte: start }
                            }
                        },
                        {
                            $addFields: {
                                day: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
                                vendorRevenueResolved: {
                                    $ifNull: ['$vendorRevenue', { $multiply: ['$totalPrice', 0.7] }]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: '$day',
                                vendorRevenue: { $sum: '$vendorRevenueResolved' },
                                ticketsSold: { $sum: '$quantity' }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ])
                    .toArray();

                // Tickets added aggregated by day for this vendor
                const ticketsAgg = await ticketsColl
                    .aggregate([
                        {
                            $match: {
                                vendorEmail: email,
                                createdAt: { $gte: start }
                            }
                        },
                        { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
                        { $group: { _id: '$day', ticketsAdded: { $sum: 1 } } },
                        { $sort: { _id: 1 } }
                    ])
                    .toArray();

                const totalRevenue = paymentAgg.reduce((sum, d) => sum + (d.vendorRevenue || 0), 0);
                const totalSold = paymentAgg.reduce((sum, d) => sum + (d.ticketsSold || 0), 0);
                const totalAdded = ticketsAgg.reduce((sum, d) => sum + (d.ticketsAdded || 0), 0);

                res.send({
                    totals: {
                        totalRevenue: Number(totalRevenue.toFixed(2)),
                        ticketsSold: totalSold,
                        ticketsAdded: totalAdded
                    },
                    series: {
                        revenue: paymentAgg.map(d => ({ date: d._id, value: Number((d.vendorRevenue || 0).toFixed(2)) })),
                        sold: paymentAgg.map(d => ({ date: d._id, value: d.ticketsSold || 0 })),
                        added: ticketsAgg.map(d => ({ date: d._id, value: d.ticketsAdded || 0 }))
                    }
                });
            } catch (error) {
                console.error('Error building vendor analytics:', error);
                res.status(500).send({ error: 'Failed to build vendor analytics' });
            }
        })

     // Platform analytics (overall + earnings)
     app.get('/platform-analytics', async (req, res) => {
            try {
                const days = Number(req.query.days || 30);
                const start = new Date();
                start.setDate(start.getDate() - (Number.isFinite(days) ? days : 30));

                const [totalUsers, totalVendors, totalTickets, totalBookings] = await Promise.all([
                    usersColl.countDocuments({}),
                    usersColl.countDocuments({ role: 'vendor' }),
                    ticketsColl.countDocuments({}),
                    paymentsColl.countDocuments({})
                ]);

                const platformRevenueAgg = await paymentsColl
                    .aggregate([
                        { $match: { paymentDate: { $gte: start } } },
                        {
                            $addFields: {
                                day: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
                                platformRevenueResolved: {
                                    $ifNull: ['$platformRevenue', { $multiply: ['$totalPrice', 0.3] }]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: '$day',
                                value: { $sum: '$platformRevenueResolved' }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ])
                    .toArray();

                const totalEarnings = platformRevenueAgg.reduce((sum, d) => sum + (d.value || 0), 0);

                res.send({
                    totals: {
                        totalUsers,
                        totalVendors,
                        totalTickets,
                        totalBookings,
                        totalEarnings: Number(totalEarnings.toFixed(2))
                    },
                    series: {
                        platformRevenueDaily: platformRevenueAgg.map(d => ({
                            date: d._id,
                            value: Number((d.value || 0).toFixed(2))
                        }))
                    }
                });
            } catch (error) {
                console.error('Error building platform analytics:', error);
                res.status(500).send({ error: 'Failed to build platform analytics' });
            }
        })

     // Get Payments by User Email (with ticket details, deduplicated)
     app.get('/payments/user/:email', async (req, res) => {
            try {
                const { email } = req.params;

                const payments = await paymentsColl
                    .aggregate([
                        { $match: { userEmail: email } },
                        {
                            $lookup: {
                                from: 'tickets',
                                localField: 'ticketId',
                                foreignField: '_id',
                                as: 'ticket'
                            }
                        },
                        { $unwind: '$ticket' },
                        {
                            $group: {
                                _id: '$stripeSessionId',
                                doc: { $first: '$$ROOT' }
                            }
                        },
                        { $replaceRoot: { newRoot: '$doc' } },
                        { $sort: { paymentDate: -1 } }
                    ])
                    .toArray();

                res.send(payments || []);
            } catch (error) {
                console.error("Error fetching user payments:", error);
                res.status(500).send({ error: "Failed to fetch payments" });
            }
        })

     // Get Payment by ID
     app.get('/payments/:paymentId', async (req, res) => {
            try {
                const { paymentId } = req.params;

                if (!ObjectId.isValid(paymentId)) {
                    return res.status(400).send({ error: "Invalid payment ID" });
                }

                const payment = await paymentsColl.findOne({
                    _id: new ObjectId(paymentId)
                });

                if (!payment) {
                    return res.status(404).send({ error: "Payment not found" });
                }

                res.send(payment);
            } catch (error) {
                console.error("Error fetching payment:", error);
                res.status(500).send({ error: "Failed to fetch payment" });
            }
        })

     // Get Payments by Ticket ID
     app.get('/payments/ticket/:ticketId', async (req, res) => {
            try {
                const { ticketId } = req.params;

                if (!ObjectId.isValid(ticketId)) {
                    return res.status(400).send({ error: "Invalid ticket ID" });
                }

                const payments = await paymentsColl
                    .find({ ticketId: new ObjectId(ticketId) })
                    .sort({ paymentDate: -1 })
                    .toArray();

                res.send(payments || []);
            } catch (error) {
                console.error("Error fetching ticket payments:", error);
                res.status(500).send({ error: "Failed to fetch payments" });
            }
        })
}

module.exports = paymentAPI;