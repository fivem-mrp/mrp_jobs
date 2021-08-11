const ObjectID = require('mongodb').ObjectID;
const config = require('./config/config.json');

let localeConvar = GetConvar("mrp_locale", "en");
let locale = config.locale[localeConvar];

MRP_SERVER = null;

emit('mrp:getSharedObject', obj => MRP_SERVER = obj);

while (MRP_SERVER == null) {
    print('Waiting for shared object....');
}

let DELIVERY_JOB = "delivery";

let playerSignups = {};

let signupLocations = {};

onNet('mrp:jobs:server:registerNetPed', (source, obj, persist = true) => {
    console.log(`Register net PED ${JSON.stringify(obj)}`);
    signupLocations[obj.businessId] = obj;

    let bid = ObjectID.createFromHexString(obj.businessId);

    let cloneObj = JSON.parse(JSON.stringify(obj));
    cloneObj.businessId = bid;
    delete cloneObj.netId;

    if (persist)
        MRP_SERVER.update('job', cloneObj, {
            businessId: obj.businessId
        }, null, (r) => {
            console.log('job created');
        });
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

    let bid = ObjectID.createFromHexString(obj.businessId);

    let cloneObj = JSON.parse(JSON.stringify(signupLocations[obj.businessId]));
    cloneObj.businessId = bid;
    delete cloneObj.netId;

    MRP_SERVER.update('job', cloneObj, {
        businessId: bid
    }, {}, (r) => {
        console.log('job updated');
    });
});

onNet('mrp:jobs:server:getJob', (source, data, uuid) => {
    MRP_SERVER.find('job', {}, undefined, undefined, (result) => {
        emitNet('mrp:jobs:server:getJob:response', source, result, uuid);
    });
});

onNet('mrp:jobs:server:signup', (source, businessId) => {
    let char = MRP_SERVER.getSpawnedCharacter(source);
    if (!char)
        return;

    let signups = playerSignups[char.stateId];
    if (!signups)
        signups = {};

    if (!signups[businessId]) {
        let bid = ObjectID.createFromHexString(businessId);
        MRP_SERVER.read('business', {
            _id: bid
        }, (business) => {
            if (!business)
                return;

            signups[businessId] = business;
            playerSignups[char.stateId] = signups;
        });
    }
});

onNet('mrp:jobs:server:addDeliveryDestination', (position, businessId) => {
    let bid = ObjectID.createFromHexString(businessId);

    let src = global.source;

    MRP_SERVER.read('job', {
        businessId: bid
    }, (r) => {
        if (!r)
            return;

        if (!r.routes)
            r.routes = [];

        r.routes.push(position);

        MRP_SERVER.update('job', r, {
            _id: r._id
        }, null, (result) => {
            emitNet('chat:addMessage', src, {
                template: '<div class="chat-message nonemergency">{0}</div>',
                args: [
                    locale.routeAdded
                ]
            });
            console.log('route for job added');
        });
    });
});

onNet('mrp:jobs:server:getMission', (jobId) => {
    let src = global.source;

    let jid = ObjectID.createFromHexString(jobId);

    MRP_SERVER.read('job', {
        _id: jid
    }, (job) => {
        if (!job) {
            console.log(`No job found for id [${jobId}]`);
            return;
        }

        MRP_SERVER.read('job', {
            _id: job.businessId
        }, (business) => {
            if (!business) {
                console.log(`No business found for id [${job.businessId}]`);
                return;
            }

            let mission = {
                type: business.type,
                data: {
                    job: job
                }
            };

            emitNet('mrp:jobs:client:startMission', src, mission);
        });
    });
});

function findCharacter(stateId) {
    let chars = MRP_SERVER.getSpawnedCharacters();
    for (let source in chars) {
        let char = chars[source];
        if (char.stateId == stateId)
            return [source, char];
    }
    return [null, null];
}

setInterval(() => {
    for (let stateId in playerSignups) {
        let signups = playerSignups[stateId];
        let [source, char] = findCharacter(stateId);
        if (char) {
            for (let businessIdStr in signups) {
                let business = signups[businessIdStr];
                if (!business.jobInProgress && business.type == DELIVERY_JOB) {
                    //doesn't have delivery job started yet give one
                    MRP_SERVER.read('job', {
                        businessId: business._id
                    }, (r) => {
                        if (!r)
                            return;
                        console.log(`Starting job [${JSON.stringify(r)}]`);
                        business.jobInProgress = true;
                        emitNet('mrp:jobs:client:startJob', source, r);
                    });
                }
            }
        }
    }
}, config.jobCheckInterval);