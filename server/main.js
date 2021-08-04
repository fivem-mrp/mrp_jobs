const config = require('./config/config.json');

let localeConvar = GetConvar("mrp_locale", "en");
let locale = config.locale[localeConvar];

MRP_SERVER = null;

emit('mrp:getSharedObject', obj => MRP_SERVER = obj);

while (MRP_SERVER == null) {
    print('Waiting for shared object....');
}

let signupLocations = {};

onNet('mrp:jobs:server:registerNetPed', (source, obj) => {
    console.log(`Register net PED ${JSON.stringify(obj)}`);
    signupLocations[obj.businessId] = obj;
});

onNet('mrp:jobs:server:unregisterNetPed', (source, businessId) => {
    console.log(`Unregister net PED for ${businessId}`);
    if (signupLocations[businessId]) {
        let jobObj = signupLocations[businessId];
        let entity = NetworkGetEntityFromNetworkId(jobObj.netId);
        DeleteEntity(entity);
        delete signupLocations[businessId];
    }
});

onNet('mrp:jobs:server:registerVehicleSpawnLocation', (source, obj) => {
    console.log(`Register vehicle spawn location ${JSON.stringify(obj)}`);
    if (!signupLocations[obj.businessId]) {
        emitNet('chat:addMessage', source, {
            template: '<div class="chat-message nonemergency">{0}</div>',
            args: [
                locale.errSetSignupFirst
            ]
        });
        return;
    }

    signupLocations[obj.businessId].vehicleSpawnLocation = obj.vehicleSpawnLocation;
});