const { ObjectId } = require('mongodb');
const { paymentsColl, ticketsColl } = require('../config/database');

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
                    quantity: paymentInfo.quantity
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
                const { userEmail, ticketId, quantity, totalPrice, stripeSessionId } = req.body;

                const parsedQuantity = parseInt(quantity);

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

                // Store payment record
                const paymentData = {
                    userEmail,
                    ticketId: new ObjectId(ticketId),
                    quantity: parsedQuantity,
                    totalPrice: parseFloat(totalPrice),
                    stripeSessionId,
                    paymentDate: new Date(),
                    status: 'completed',
                    createdAt: new Date()
                };

                const result = await paymentsColl.insertOne(paymentData);

                console.log("Payment stored successfully:", result.insertedId);
                res.send({
                    success: true,
                    message: "Payment stored and ticket quantity updated successfully",
                    paymentId: result.insertedId
                });
            } catch (error) {
                console.error("Payment storage error:", error);
                res.status(500).send({ error: "Failed to store payment" });
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

                if (!payments || payments.length === 0) {
                    return res.status(404).send({ error: "No payments found for this user" });
                }

                res.send(payments);
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

                if (!payments || payments.length === 0) {
                    return res.status(404).send({ error: "No payments found for this ticket" });
                }

                res.send(payments);
            } catch (error) {
                console.error("Error fetching ticket payments:", error);
                res.status(500).send({ error: "Failed to fetch payments" });
            }
        })
}

module.exports = paymentAPI;