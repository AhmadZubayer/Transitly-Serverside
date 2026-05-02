require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_KEY);
const express = require('express');
const cors = require('cors');
const { run } = require('./config/database');
const usersAPI = require('./collections/users');
const ticketsAPI = require('./collections/tickets');
const staticDataAPI = require('./collections/staticData');
const paymentAPI = require('./collections/payments');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    res.send('Transitly Server is Live')
});

usersAPI(app);
ticketsAPI(app);
staticDataAPI(app);
paymentAPI(app, stripe);

run().then(() => {
        app.listen(port, () => {
            console.log(`Transitly server running on port ${port}`);
        });
}).catch(console.dir);


