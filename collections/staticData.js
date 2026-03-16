const districts = require('../data/Districts.json');
const busTypes = require('../data/BusType.json');


function staticDataAPI(app) {

    app.get('/districts', (req, res) => {
        res.send(districts);
    })

    app.get('/bus-type', (req, res) => {
        res.send(busTypes);
    })
}

module.exports = staticDataAPI;
