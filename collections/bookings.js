const { ObjectId } = require('mongodb');
const { bookingsColl, ticketsColl } = require('../config/database');
const { verifyFBToken, verifyVendor } = require('../firebase/firebaseVerify');

function bookingsAPI(app) {
    app.post('/bookings', verifyFBToken, async (req, res) => {
        try {
            const bookingData = req.body;
            bookingData.userEmail = req.decoded_email;
            bookingData.status = 'pending';
            bookingData.createdAt = new Date();
            
            if (bookingData.ticketId) {
                bookingData.ticketId = new ObjectId(bookingData.ticketId);
            }

            const result = await bookingsColl.insertOne(bookingData);
            res.send(result);
        } catch (error) {
            console.error("Database error:", error);
            res.status(500).send({ error: "Failed to create booking" });
        }
    });

    app.get('/bookings/user/:email', verifyFBToken, async (req, res) => {
        try {
            const { email } = req.params;
            if (email !== req.decoded_email) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const bookings = await bookingsColl.aggregate([
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
                { $sort: { createdAt: -1 } }
            ]).toArray();

            res.send(bookings);
        } catch (error) {
            console.error("Database error:", error);
            res.status(500).send({ error: "Failed to fetch user bookings" });
        }
    });

    app.get('/bookings/vendor/:email', verifyFBToken, verifyVendor, async (req, res) => {
        try {
            const { email } = req.params;
            if (email !== req.decoded_email) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const bookings = await bookingsColl.aggregate([
                {
                    $lookup: {
                        from: 'tickets',
                        localField: 'ticketId',
                        foreignField: '_id',
                        as: 'ticket'
                    }
                },
                { $unwind: '$ticket' },
                { $match: { 'ticket.vendorEmail': email } },
                { $sort: { createdAt: -1 } }
            ]).toArray();

            res.send(bookings);
        } catch (error) {
            console.error("Database error:", error);
            res.status(500).send({ error: "Failed to fetch vendor bookings" });
        }
    });

    app.patch('/bookings/:id/status', verifyFBToken, verifyVendor, async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: "Invalid booking ID" });
            }

            const allowed = ['accepted', 'rejected'];
            if (!allowed.includes(status)) {
                return res.status(400).send({ error: "Invalid status" });
            }

            const booking = await bookingsColl.aggregate([
                { $match: { _id: new ObjectId(id) } },
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

            if (!booking.length) {
                return res.status(404).send({ error: "Booking not found" });
            }

            if (booking[0].ticket.vendorEmail !== req.decoded_email) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const result = await bookingsColl.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status, updatedAt: new Date() } }
            );

            res.send(result);
        } catch (error) {
            console.error("Database error:", error);
            res.status(500).send({ error: "Failed to update booking status" });
        }
    });
}

module.exports = bookingsAPI;