const { ObjectId } = require('mongodb');
const { ticketsColl, usersColl } = require('../config/database');
const { busFeatures } = require('../data/BusFeatures.json');
const { verifyFBToken, verifyAdmin, verifyVendor } = require('../firebase/firebaseVerify');

function ticketsAPI(app) {

    // POST TICKETS
    app.post('/tickets', verifyFBToken, verifyVendor, async (req, res) => {
        try {
            const ticketData = req.body;
            if (ticketData?.vendorEmail && ticketData.vendorEmail !== req.decoded_email) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const user = await usersColl.findOne({ email: req.decoded_email });
            if (user?.role === 'fraud') {
                return res.status(403).send({ message: 'Fraud vendors cannot add tickets' });
            }

            ticketData.createdAt = new Date();
            const result = await ticketsColl.insertOne(ticketData);
            res.send(result);
            console.log("DB POST: ", req.body.parcelName);
            console.log(result);
        } catch (error) {
            console.error("Database error:", error);
            res.status(500).send({ error: "Failed to save ticket" });
        }
    })

    app.get("/tickets", async (req, res) => {
        try {
            const {
                limit = 0,
                skip = 0,
                sort = 'departureDateTime',
                order = 'asc',
                search = '',
                from = '',
                to = '',
                minPrice = 0,
                maxPrice = Infinity,
                features = '',
                type = '',
                departureDate = '',
                returnDate = '',
                busBrand = '',
                busCompany = '',
            } = req.query;

            const sortSettings = {};
            const validSortFields = ['price', 'departureDateTime', 'ticketTitle'];
            const sortField = validSortFields.includes(sort) ? sort : 'departureDateTime';
            sortSettings[sortField] = order === 'asc' ? 1 : -1;

            const searchQuery = {};
            searchQuery.adminVerified = 'Yes';

            const fraudVendors = await usersColl.find({ role: 'fraud' }, { projection: { email: 1 } }).toArray();
            const fraudEmails = fraudVendors.map(v => v.email);
            if (fraudEmails.length > 0) {
                searchQuery.vendorEmail = { $nin: fraudEmails };
            }

            if (search) {
                searchQuery.$or = [
                    { ticketTitle: { $regex: search, $options: "i" } },
                    { from: { $regex: search, $options: "i" } },
                    { to: { $regex: search, $options: "i" } },
                    { busBrand: { $regex: search, $options: "i" } },
                    { busCompany: { $regex: search, $options: "i" } },
                    { transportType: { $regex: search, $options: "i" } },
                ];
            }
            if (from) {
                searchQuery.from = { $regex: from, $options: "i" };
            }
            if (to) {
                searchQuery.to = { $regex: to, $options: "i" };
            }
            if (type) {
                searchQuery.transportType = { $regex: type, $options: "i" };
            }

            if (busBrand) {
                searchQuery.busBrand = { $regex: busBrand, $options: "i" };
            }
            if (busCompany) {  
                searchQuery.busCompany = { $regex: busCompany, $options: "i" };
            }

            if (minPrice || (maxPrice && maxPrice !== Infinity)) {
                searchQuery.price = {};
                if (minPrice) searchQuery.price.$gte = Number(minPrice);
                if (maxPrice && maxPrice !== 'Infinity') searchQuery.price.$lte = Number(maxPrice);
            }

            const requiredPerks = [];
            if (features) {
                const selFeatures = features.split(',').map(f => 
                    decodeURIComponent(f.trim())
                );
                
                selFeatures.forEach(selFeatures => {
                    const matchedFeature = busFeatures.find(available => 
                        available.toLowerCase() === selFeatures.toLowerCase()
                    );
                    if (matchedFeature) {
                        requiredPerks.push(matchedFeature);
                    }
                });
            }

            if (requiredPerks.length > 0) {
                searchQuery.perks = { $all: requiredPerks };
            }

            if (departureDate) {
                const startOfDay = new Date(`${departureDate}T00:00:00`).toISOString();
                const endOfDay = new Date(`${departureDate}T23:59:59`).toISOString();
                searchQuery.departureDateTime = {
                    $gte: startOfDay,
                    $lte: endOfDay,
                };
            }

            if (returnDate) {
                const startOfDay = new Date(`${returnDate}T00:00:00`).toISOString();
                const endOfDay = new Date(`${returnDate}T23:59:59`).toISOString();
                searchQuery.returnDateTime = {
                    $gte: startOfDay,
                    $lte: endOfDay,
                };
            }

            console.log("Search Query:", JSON.stringify(searchQuery, null, 2));
            console.log("Sort Settings:", sortSettings);

            const tickets = await ticketsColl
                .find(searchQuery)
                .sort(sortSettings)
                .limit(Number(limit))
                .skip(Number(skip))
                .project({
                    ticketTitle: 1,
                    ticketID: 1,
                    from: 1,
                    to: 1,
                    transportType: 1,
                    busBrand: 1,
                    busCompany: 1,
                    price: 1,
                    quantity: 1,
                    perks: 1,
                    departureDateTime: 1,
                    vendorName: 1,
                    bookingStatus: 1,
                })
                .toArray();

            const totalTicketCount = await ticketsColl.countDocuments(searchQuery);
            res.send({ tickets, total: totalTicketCount });

        } catch (error) {
            console.log(error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    app.get('/tickets/all', verifyFBToken, verifyAdmin, async (req, res) => {
        try {
            const { filter = 'all', limit = 20, skip = 0 } = req.query;
            const query = {};
            if (filter === 'pending') {
                query.adminVerified = 'No';
            }
            const tickets = await ticketsColl
                .find(query)
                .sort({ createdAt: -1 })
                .limit(Number(limit))
                .skip(Number(skip))
                .toArray();
            const total = await ticketsColl.countDocuments(query);
            res.send({ tickets, total });
        } catch (error) {
            console.error('Database error, Unable to fetch tickets (admin):', error);
            res.status(500).send({ error: 'Failed to fetch tickets' });
        }
    });

    app.get('/tickets/vendor/:email', verifyFBToken, verifyVendor, async (req, res) => {
        try {
            const { email } = req.params;
            if (email !== req.decoded_email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const tickets = await ticketsColl.find({ vendorEmail: email }).sort({ createdAt: -1 }).toArray();
            res.send(tickets);
        } catch (error) {
            console.error('Database error, Unable to fetch vendor tickets:', error);
            res.status(500).send({ error: 'Failed to fetch vendor tickets' });
        }
    });

    app.patch('/tickets/:id/verify', verifyFBToken, verifyAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: 'Invalid ticket ID' });
            }
            const result = await ticketsColl.updateOne(
                { _id: new ObjectId(id) },
                { $set: { adminVerified: 'Yes', verifiedAt: new Date() } }
            );
            if (!result.matchedCount) {
                return res.status(404).send({ error: 'Ticket not found' });
            }
            res.send(result);
        } catch (error) {
            console.error('Database error, Unable to verify ticket:', error);
            res.status(500).send({ error: 'Failed to verify ticket' });
        }
    });

    app.patch('/tickets/:id/reject', verifyFBToken, verifyAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: 'Invalid ticket ID' });
            }
            const result = await ticketsColl.updateOne(
                { _id: new ObjectId(id) },
                { $set: { adminVerified: 'Rejected', rejectedAt: new Date() } }
            );
            if (!result.matchedCount) {
                return res.status(404).send({ error: 'Ticket not found' });
            }
            res.send(result);
        } catch (error) {
            console.error('Database error, Unable to reject ticket:', error);
            res.status(500).send({ error: 'Failed to reject ticket' });
        }
    });

    app.patch('/tickets/:id/feature', verifyFBToken, verifyAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { adminFeatured } = req.body;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: 'Invalid ticket ID' });
            }

            const allowed = ['Yes', 'No'];
            if (!allowed.includes(adminFeatured)) {
                return res.status(400).send({ error: 'Invalid adminFeatured value' });
            }

            const result = await ticketsColl.updateOne(
                { _id: new ObjectId(id) },
                { $set: { adminFeatured, featuredAt: adminFeatured === 'Yes' ? new Date() : null } }
            );

            if (!result.matchedCount) {
                return res.status(404).send({ error: 'Ticket not found' });
            }

            res.send(result);
        } catch (error) {
            console.error('Database error, Unable to feature ticket:', error);
            res.status(500).send({ error: 'Failed to feature ticket' });
        }
    });

    app.patch('/tickets/:id', verifyFBToken, verifyVendor, async (req, res) => {
        try {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: 'Invalid ticket ID' });
            }

            const existing = await ticketsColl.findOne(
                { _id: new ObjectId(id) },
                { projection: { vendorEmail: 1, adminVerified: 1 } }
            );
            if (!existing) {
                return res.status(404).send({ error: 'Ticket not found' });
            }
            if (existing.vendorEmail !== req.decoded_email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            if ((existing.adminVerified || 'No') === 'Yes') {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const update = { ...req.body };
            delete update._id;

            const result = await ticketsColl.updateOne(
                { _id: new ObjectId(id) },
                { $set: update }
            );

            if (!result.matchedCount) {
                return res.status(404).send({ error: 'Ticket not found' });
            }

            res.send(result);
        } catch (error) {
            console.error('Database error, Unable to update ticket:', error);
            res.status(500).send({ error: 'Failed to update ticket' });
        }
    });

    app.delete('/tickets/:id', verifyFBToken, async (req, res) => {
        try {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: 'Invalid ticket ID' });
            }

           
            const requester = await ticketsColl.findOne(
                { _id: new ObjectId(id) },
                { projection: { vendorEmail: 1 } }
            );
            if (!requester) {
                return res.status(404).send({ error: 'Ticket not found' });
            }
            const user = await require('../config/database').usersColl.findOne(
                { email: req.decoded_email },
                { projection: { role: 1 } }
            );
            const isAdmin = user?.role === 'admin';
            const isOwnerVendor = requester.vendorEmail === req.decoded_email;
            if (!isAdmin && !isOwnerVendor) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const result = await ticketsColl.deleteOne({ _id: new ObjectId(id) });
            if (!result.deletedCount) {
                return res.status(404).send({ error: 'Ticket not found' });
            }
            res.send(result);
        } catch (error) {
            console.error('Database error, Unable to delete ticket:', error);
            res.status(500).send({ error: 'Failed to delete ticket' });
        }
    });

    
app.get("/tickets/advertised", async (req, res) => {
    try {
     
        const fraudVendors = await usersColl.find({ role: 'fraud' }, { projection: { email: 1 } }).toArray();
        const fraudEmails = fraudVendors.map(v => v.email);
        
        const query = { adminVerified: 'Yes', adminFeatured: 'Yes' };
        if (fraudEmails.length > 0) {
            query.vendorEmail = { $nin: fraudEmails };
        }

        const tickets = await ticketsColl
            .find(query)
            .sort({ featuredAt: -1 })
            .limit(6)
            .project({
                ticketTitle: 1,
                image: 1,
                price: 1,
                quantity: 1,
                transportType: 1,
                busCompany: 1,
                departureDateTime: 1,
                perks: 1,
                from: 1,
                to: 1,
            })
            .toArray();

        res.send(tickets);
    } catch (error) {
        console.error("Failed to fetch advertised tickets:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.get("/tickets/latest", async (req, res) => {
    try {
        const { limit = 8 } = req.query;

        const fraudVendors = await usersColl.find({ role: 'fraud' }, { projection: { email: 1 } }).toArray();
        const fraudEmails = fraudVendors.map(v => v.email);

        const query = { adminVerified: 'Yes' };
        if (fraudEmails.length > 0) {
            query.vendorEmail = { $nin: fraudEmails };
        }

        const tickets = await ticketsColl
            .find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .project({
                ticketTitle: 1,
                image: 1,
                price: 1,
                quantity: 1,
                transportType: 1,
                busCompany: 1,
                departureDateTime: 1,
                perks: 1,
                from: 1,
                to: 1,
            })
            .toArray();

        res.send(tickets);
    } catch (error) {
        console.error("Failed to fetch latest tickets:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

     app.get("/tickets/:id", async (req, res) => {
        try {
            const { id } = req.params;

           
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: "Invalid ticket ID" });
            }

            const ticket = await ticketsColl.findOne(
                { _id: new ObjectId(id) }
            );

            if (!ticket) {
                return res.status(404).send({ error: "Ticket not found" });
            }

           
            const vendor = await usersColl.findOne({ email: ticket.vendorEmail }, { projection: { role: 1 } });
            if (vendor?.role === 'fraud') {
                return res.status(403).send({ error: "This ticket is no longer available" });
            }

            const projectedTicket = {
                _id: ticket._id,
                ticketTitle: ticket.ticketTitle,
                ticketID: ticket.ticketID,
                from: ticket.from,
                to: ticket.to,
                transportType: ticket.transportType,
                busBrand: ticket.busBrand,
                busCompany: ticket.busCompany,
                price: ticket.price,
                quantity: ticket.quantity,
                perks: ticket.perks,
                departureDateTime: ticket.departureDateTime,
                returnDateTime: ticket.returnDateTime,
                vendorName: ticket.vendorName,
                bookingStatus: ticket.bookingStatus,
                createdAt: ticket.createdAt,
            };

            res.send(projectedTicket);
        } catch (error) {
            console.error("Error fetching ticket:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

  

}

module.exports = ticketsAPI;
