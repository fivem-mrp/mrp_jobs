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
    if (signupLocations[obj.businessId]) {
        signupLocations[obj.businessId].signupLocation = obj.signupLocation;
        if (obj.vehicleSpawnLocation)
            signupLocations[obj.businessId].vehicleSpawnLocation = obj.vehicleSpawnLocation;
        if (obj.netId)
            signupLocations[obj.businessId].netId = obj.netId;
    } else {
        signupLocations[obj.businessId] = obj;
    }

    let bid = ObjectID(obj.businessId);

    let query = {
        businessId: bid
    };

    let cloneObj = JSON.parse(JSON.stringify(obj));
    cloneObj.businessId = bid;
    delete cloneObj.netId;

    if (persist)
        MRP_SERVER.update('job', cloneObj, query, null, (r) => {
            if (r.modifiedCount > 0 || r.upsertedCount > 0) {
                console.log('job created/updated');
                MRP_SERVER.read('job', {
                    businessId: bid
                }, (job) => {
                    if (!job)
                        return;

                    emitNet('mrp:jobs:client:registerJob', -1, job);
                });
            }
        });
});

onNet('mrp:jobs:server:unregisterNetPed', (source, businessId) => {
    console.log(`Unregister net PED for ${businessId}`);
    if (signupLocations[businessId]) {
        let jobObj = signupLocations[businessId];
        console.log(`Signup location found [${JSON.stringify(jobObj)}]`);
        if (jobObj.netId) {
            console.log(`netId exists [${jobObj.netId}]`);
            let entity = NetworkGetEntityFromNetworkId(jobObj.netId);
            DeleteEntity(entity);
            delete jobObj.netId;
            //delete signupLocations[businessId];
        }
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
        if (r.modifiedCount > 0 || r.upsertedCount > 0) {
            console.log('job updated');
            MRP_SERVER.read('job', {
                businessId: bid
            }, (job) => {
                if (!job)
                    return;

                emitNet('mrp:jobs:client:registerJob', -1, job);
            });
        }
    });
});

onNet('mrp:jobs:server:getJob', (source, data, uuid) => {
    MRP_SERVER.find('job', {}, undefined, undefined, (result) => {
        emitNet('mrp:jobs:server:getJob:response', source, result, uuid);
    });
});

onNet('mrp:jobs:server:getJobById', (source, businessId, uuid) => {
    let bid = ObjectID.createFromHexString(businessId);

    MRP_SERVER.read('job', {
        businessId: bid
    }, (result) => {
        emitNet('mrp:jobs:server:getJobById:response', source, result, uuid);
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
            //TODO send to all clients ASAP simmilar to registering net PEDs
        });
    });
});

onNet('mrp:jobs:server:removeDeliveryDestination', (position, businessId) => {
    let bid = ObjectID.createFromHexString(businessId);

    let src = global.source;

    MRP_SERVER.read('job', {
        businessId: bid
    }, (r) => {
        if (!r)
            return;

        if (!r.routes)
            r.routes = [];

        let newRoutes = [];
        for (let route of r.routes) {
            if (route.x != position.x || route.y != position.y || route.z != position.z) {
                newRoutes.push(route);
            }
        }

        r.routes = newRoutes;

        MRP_SERVER.update('job', r, {
            _id: r._id
        }, null, (result) => {
            emitNet('chat:addMessage', src, {
                template: '<div class="chat-message nonemergency">{0}</div>',
                args: [
                    locale.routeRemoved
                ]
            });
            console.log('route for job removed');
            //TODO send to all clients ASAP simmilar to registering net PEDs
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

        MRP_SERVER.read('business', {
            _id: job.businessId
        }, (business) => {
            if (!business) {
                console.log(`No business found for id [${JSON.stringify(job.businessId)}]`);
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
                        console.log(`Starting job [${JSON.stringify(r)}] for player ID [${source}]`);
                        business.jobInProgress = true;
                        emitNet('mrp:jobs:client:startJob', source, r);
                    });
                }
            }
        }
    }
}, config.jobCheckInterval);