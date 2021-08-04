let signupNPCs = {};

onNet('mrp:jobs:server:registerNetPed', (source, netId, businessId) => {
    signupNPCs[businessId] = netId;
});

onNet('mrp:jobs:server:unregisterNetPed', (source, businessId) => {
    if (signupNPCs[businessId]) {
        let entity = NetworkGetEntityFromNetworkId(signupNPCs[businessId]);
        DeleteEntity(entity);
        delete signupNPCs[businessId];
    }
});