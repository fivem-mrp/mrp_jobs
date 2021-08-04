MRP_SERVER = null;

emit('mrp:getSharedObject', obj => MRP_SERVER = obj);

while (MRP_SERVER == null) {
    print('Waiting for shared object....');
}

let signupNPCs = {};

onNet('mrp:jobs:server:registerNetPed', (source, obj) => {
    signupNPCs[obj.businessId] = obj;
});

onNet('mrp:jobs:server:unregisterNetPed', (source, businessId) => {
    if (signupNPCs[businessId]) {
        let jobObj = signupNPCs[businessId];
        let entity = NetworkGetEntityFromNetworkId(jobObj.netId);
        DeleteEntity(entity);
        delete signupNPCs[businessId];
    }
});