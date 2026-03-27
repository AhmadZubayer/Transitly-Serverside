const districts = require('../data/Districts.json');
const busTypes = require('../data/BusType.json');
const busCompanies = require('../data/Companies.json');
const busBrands = require('../data/BusBrands.json');
const busFeatures = require('../data/BusFeatures.json');
const policies = require('../data/Policies.json');


function staticDataAPI(app) {

    app.get('/districts', (req, res) => {
        res.send(districts);
    })

    app.get('/bus-type', (req, res) => {
        res.send(busTypes);
    })

    app.get('/bus-company', (req, res) => {
        res.send(busCompanies);
    })

    app.get('/bus-brand', (req, res) => {
        res.send(busBrands);
    })

    app.get('/bus-features', (req, res) => {
        res.send(busFeatures);
    })

    app.get('/policies', (req, res) => {
        res.send(policies);
    })
}

module.exports = staticDataAPI;
