const { ObjectId } = require('mongodb');
const { ticketsColl } = require('../config/database');

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
                wifi,
                ac,
                comfortSeats,
                type = '',
                departureDate = '',
                busBrand = '',
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

            if (minPrice || (maxPrice && maxPrice !== Infinity)) {
                searchQuery.price = {};
                if (minPrice) searchQuery.price.$gte = Number(minPrice);
                if (maxPrice && maxPrice !== 'Infinity') searchQuery.price.$lte = Number(maxPrice);
            }

            const requiredPerks = [];
            if (wifi === 'true') requiredPerks.push("WiFi");
            if (ac === 'true') requiredPerks.push("AC");
            if (comfortSeats === 'true') requiredPerks.push("Comfortable Seats");

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


}

module.exports = ticketsAPI;
