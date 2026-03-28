const { ObjectId } = require('mongodb');
const { ticketsColl } = require('../config/database');
const { busFeatures } = require('../data/BusFeatures.json');

function ticketsAPI(app) {

    // POST TICKETS
    app.post('/tickets', async (req, res) => {
        try {
            const ticketData = req.body;
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

    // GET ALL TICKETS FOR PUBLIC ROUTES
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
            if (search) {
                searchQuery.ticketTitle = { $regex: search, $options: "i" };
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
            if (busCompany) {  // ADD THIS
                searchQuery.busCompany = { $regex: busCompany, $options: "i" };
            }

            if (minPrice || (maxPrice && maxPrice !== Infinity)) {
                searchQuery.price = {};
                if (minPrice) searchQuery.price.$gte = Number(minPrice);
                if (maxPrice && maxPrice !== 'Infinity') searchQuery.price.$lte = Number(maxPrice);
            }

            const requiredPerks = [];
            if (features) {
                // Split by comma or plus sign and decode URL encoding
                const selFeatures = features.split(',').map(f => 
                    decodeURIComponent(f.trim())
                );
                
                // Match requested features against available features (case-insensitive)
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


    // GET SINGLE TICKET BY ID
    app.get("/tickets/:id", async (req, res) => {
        try {
            const { id } = req.params;

            // Validate ObjectId
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: "Invalid ticket ID" });
            }

            const ticket = await ticketsColl.findOne(
                { _id: new ObjectId(id) },
                {
                    projection: {
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
                        returnDateTime: 1,
                        vendorName: 1,
                        bookingStatus: 1,
                        createdAt: 1,
                    }
                }
            );

            if (!ticket) {
                return res.status(404).send({ error: "Ticket not found" });
            }

            res.send(ticket);
        } catch (error) {
            console.error("Error fetching ticket:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

}

module.exports = ticketsAPI;
