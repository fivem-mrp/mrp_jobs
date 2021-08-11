eval(LoadResourceFile('mrp_core', 'client/helpers.js'));

const configFile = LoadResourceFile(GetCurrentResourceName(), 'config/config.json');

eval(LoadResourceFile('mrp_core', 'client/helpers.js'));

const config = JSON.parse(configFile);

const localeConvar = GetConvar("mrp_locale", "en");
const locale = config.locale[localeConvar];

MRP_CLIENT = null;

emit('mrp:employment:getSharedObject', obj => MRP_CLIENT = obj);

while (MRP_CLIENT == null) {
    console.log('Waiting for shared object....');
}

let creatorRoles = [];
let creatorBusinesses = [];

const managementStates = {
    NONE: "NONE",
    PLACE_NPC: "PLACE_NPC",
    PLACE_VEH: "PLACE_VEH"
};

const missionTypes = {
    DELIVERY: "delivery"
};

let state = {
    name: managementStates.NONE,
    data: {}
};

let myJobs = {};
let myMissions = {};
let allJobs = {};

on('onClientResourceStart', (name) => {
    if (name != GetCurrentResourceName())
        return;

    MRP_CLIENT.TriggerServerCallback('mrp:jobs:server:getJob', [undefined], (result) => {
        for (let r of result) {
            let oid = ObjectID(Object.values(r.businessId.id)).toString();
            allJobs[oid] = r;
            if (r.signupLocation) {
                let sl = r.signupLocation;
                MRP_CLIENT.spawnSharedNPC({
                    model: sl.modelHash,
                    x: sl.x,
                    y: sl.y,
                    z: sl.z,
                    heading: sl.heading
                });

                let obj = {
                    businessId: oid,
                    signupLocation: {
                        x: sl.x,
                        y: sl.y,
                        z: sl.z,
                        heading: sl.heading,
                        modelHash: sl.modelHash
                    }
                };

                if (r.vehicleSpawnLocation)
                    obj.vehicleSpawnLocation = r.vehicleSpawnLocation;

                emitNet('mrp:jobs:server:registerNetPed', GetPlayerServerId(PlayerId()), obj, false);
            }
        }
    });
});

function fillRadialMenu(businesses) {
    if (businesses && businesses.length > 0) {
        for (let business of businesses) {
            let submenu = [];
            if (business && business.type == "delivery") {
                let id = "set_signup_location";
                if (business._id && business._id.id) {
                    id = ObjectID(Object.values(business._id.id)).toString();
                }

                submenu.push({
                    id: 'job_add_delivery_destination_' + id,
                    text: locale.addDeliveryDestination,
                    action: 'https://mrp_jobs/add_delivery_destination'
                });

                submenu.push({
                    id: "signup_" + id,
                    text: locale.setSignupLocation,
                    action: 'https://mrp_jobs/set_signup_location'
                });

                submenu.push({
                    id: "spawn_" + id,
                    text: locale.setVehicleSpawnLocation,
                    action: 'https://mrp_jobs/set_vehicle_spawn_location'
                });

                emit('mrp:radial_menu:addMenuItem', {
                    id: 'job_management',
                    text: business.name,
                    submenu: submenu,
                    persist: true,
                    action: 'https://mrp_jobs/job_management'
                });
            }
        }
    }
}

setInterval(() => {
    let emps = MRP_CLIENT.employment.getEmployment();

    if (emps && emps.employment) {
        creatorBusinesses = [];
        creatorRoles = [];
        for (let emp of emps.employment) {
            let creatorRole = MRP_CLIENT.employment.getRole(emp.business, emp.role);
            if (creatorRole && creatorRole.canCreateJobs) {
                let creatorBusiness = MRP_CLIENT.employment.getBusiness(emp.business);
                creatorRoles.push(creatorRole);
                creatorBusinesses.push(creatorBusiness);
            }
        }

        fillRadialMenu(creatorBusinesses);
    }
}, 1000);

RegisterNuiCallbackType('set_signup_location_cancel');
on('__cfx_nui:set_signup_location_cancel', (data, cb) => {
    cb({});
});

RegisterNuiCallbackType('job_management');
on('__cfx_nui:job_management', (data, cb) => {
    cb({});
});

RegisterNuiCallbackType('add_delivery_destination');
on('__cfx_nui:add_delivery_destination', (data, cb) => {
    cb({});

    let ped = PlayerPedId();
    if (ped) {
        let id = data.id.replaceAll("job_add_delivery_destination_", "");
        let [coordX, coordY, coordZ] = GetEntityCoords(ped);
        emitNet('mrp:jobs:server:addDeliveryDestination', {
            x: coordX,
            y: coordY,
            z: coordZ
        }, id);
    }
});

RegisterNuiCallbackType('set_signup_location');
on('__cfx_nui:set_signup_location', (data, cb) => {
    data.id = data.id.replaceAll("signup_", ""); // replace underscores for spaces back

    emit("mrp:jobs:client:set_signup_location", data);

    cb({});
});

RegisterNuiCallbackType('set_vehicle_spawn_location');
on('__cfx_nui:set_vehicle_spawn_location', (data, cb) => {
    data.id = data.id.replaceAll("spawn_", ""); // replace underscores for spaces back

    emit("mrp:jobs:client:set_vehicle_spawn_location", data);

    cb({});
});

on('mrp:jobs:client:set_signup_location', (data) => {
    let select = '<select name="jobSignupPED">';
    for (let pedHash of config.pedList) {
        select += '<option value="' + pedHash + '">' + pedHash + '</option>';
    }
    select += '</select>';
    emit('mrp:popup', {
        message: '<input type="hidden" name="businessId" value="' + data.id + '"><label for="jobSignupPED">' + locale.jobSignupPED + ':</label>' + select,
        actions: [{
            text: locale.set,
            url: 'https://mrp_jobs/set_signup_location_confirm'
        }, {
            text: locale.cancel,
            url: 'https://mrp_jobs/set_signup_location_cancel'
        }]
    });
});

on('mrp:jobs:client:set_vehicle_spawn_location', (data) => {
    let select = '<select name="jobVehicleModelSpawn">';
    for (let vehHash of config.deliveryVehicles) {
        select += '<option value="' + vehHash + '">' + vehHash + '</option>';
    }
    select += '</select>';
    emit('mrp:popup', {
        message: '<input type="hidden" name="businessId" value="' + data.id + '"><label for="jobVehicleModelSpawn">' + locale.jobVehicleModelSpawn + ':</label>' + select,
        actions: [{
            text: locale.set,
            url: 'https://mrp_jobs/set_vehicle_spawn_location_confirm'
        }, {
            text: locale.cancel,
            url: 'https://mrp_jobs/set_vehicle_spawn_location_cancel'
        }]
    });
});

function startDeliveryMission(mission) {
    if (!mission || !mission.data || !mission.data.job)
        return;

    let job = mission.data.job;

    let oid = ObjectID(Object.values(job._id.id)).toString();

    let deliveryStages = config.missionStages[mission.type];

    let msg = locale[deliveryStages[0]];

    myMissions[oid] = {
        type: mission.type,
        job: job,
        message: msg,
        currentStageIndex: 0,
        currentStage: deliveryStages[0]
    };

    let asyncStart = async () => {
        RequestModel(job.vehicleSpawnLocation.modelHash);
        while (!HasModelLoaded(job.vehicleSpawnLocation.modelHash)) {
            await utils.sleep(100);
        }

        let veh = CreateVehicle(job.vehicleSpawnLocation.modelHash, job.vehicleSpawnLocation.x, job.vehicleSpawnLocation.y, job.vehicleSpawnLocation.z, job.vehicleSpawnLocation.heading, true, true);
        let plate = GetVehicleNumberPlateText(veh).trim();

        let blip = AddBlipForEntity(veh);
        SetBlipSprite(blip, config.deliveryBlip);
        SetBlipScale(blip, 1.0);
        SetBlipAsShortRange(blip, true);
        SetBlipColour(blip, config.deliveryBlipColor);
        SetBlipRoute(blip, true);
        SetBlipRouteColour(blip, config.deliveryBlipColor);

        myMissions[oid].vehicle = veh;
        myMissions[oid].blip = blip;

        //TODO group
        emitNet('mrp:vehicle:server:giveKeys', [GetPlayerServerId(PlayerId())], plate);

        emit('mrp_phone:showNotification', msg, deliveryStages[0], true);
    };

    asyncStart();
}

onNet('mrp:jobs:client:startMission', (mission) => {
    if (!mission)
        return;

    switch (mission.type) {
        case missionTypes.DELIVERY:
            startDeliveryMission(mission);
            break;
        default:
            break;
    }
});

RegisterNuiCallbackType('set_vehicle_spawn_location_confirm');
on('__cfx_nui:set_vehicle_spawn_location_confirm', (data, cb) => {
    cb({});

    if (state.name == managementStates.NONE)
        startPlacinngVehicleSpawn(data.jobVehicleModelSpawn, data.businessId);
});

RegisterNuiCallbackType('set_vehicle_spawn_location_cancel');
on('__cfx_nui:set_vehicle_spawn_location_cancel', (data, cb) => {
    cb({});
});

function startPlacinngNPC(model, businessId) {
    let exec = async () => {
        let ped = PlayerPedId();

        let [playerX, playerY, playerZ] = GetEntityCoords(ped, true);
        let [offsetX, offsetY, offsetZ] = GetOffsetFromEntityInWorldCoords(ped, 0, 2.0, 0);

        let dx = playerX - offsetX;
        let dy = playerY - offsetY;

        let heading = GetHeadingFromVector_2d(dx, dy);

        let modelHash = GetHashKey(model);
        RequestModel(modelHash);
        while (!HasModelLoaded(modelHash)) {
            await utils.sleep(100);
        }

        let npcPED = CreatePed(GetPedType(model), modelHash, offsetX, offsetY, offsetZ, heading, false, false);
        SetBlockingOfNonTemporaryEvents(npcPED, true);
        SetPedKeepTask(npcPED, true);
        SetPedDropsWeaponsWhenDead(npcPED, false);
        SetPedFleeAttributes(npcPED, 0, 0);
        SetPedCombatAttributes(npcPED, 17, 1);
        SetPedSeeingRange(npcPED, 0.0);
        SetPedHearingRange(npcPED, 0.0);
        SetPedAlertness(npcPED, 0.0);
        SetEntityInvincible(npcPED, true);
        SetEntityCollision(npcPED, false, false);

        state.name = managementStates.PLACE_NPC;
        state.data.ped = npcPED;
        state.data.businessId = businessId;
    }
    exec();
}

function startPlacinngVehicleSpawn(model, businessId) {
    let exec = async () => {
        let ped = PlayerPedId();

        let [playerX, playerY, playerZ] = GetEntityCoords(ped, true);
        let [offsetX, offsetY, offsetZ] = GetOffsetFromEntityInWorldCoords(ped, 0, 5.0, 0);

        let dx = playerX - offsetX;
        let dy = playerY - offsetY;

        let heading = GetHeadingFromVector_2d(dx, dy);

        let modelHash = GetHashKey(model);
        RequestModel(modelHash);
        while (!HasModelLoaded(modelHash)) {
            await utils.sleep(100);
        }

        let veh = CreateVehicle(modelHash, offsetX, offsetY, offsetZ, heading, false, false);
        SetEntityCollision(veh, false, false);

        state.name = managementStates.PLACE_VEH;
        state.data.veh = veh;
        state.data.businessId = businessId;
    }
    exec();
}

RegisterNuiCallbackType('set_signup_location_confirm');
on('__cfx_nui:set_signup_location_confirm', (data, cb) => {
    cb({});

    if (state.name == managementStates.NONE)
        startPlacinngNPC(data.jobSignupPED, data.businessId);
});

RegisterNuiCallbackType('signup');
on('__cfx_nui:signup', (data, cb) => {
    cb({});

    if (data.businessId) {
        emitNet('mrp:jobs:server:signup', GetPlayerServerId(PlayerId()), data.businessId);
    }
});

RegisterNuiCallbackType('get_mission');
on('__cfx_nui:get_mission', (data, cb) => {
    cb({});

    if (data.jobId) {
        let job = myJobs[data.jobId];
        if (job)
            emitNet('mrp:jobs:server:getMission', data.jobId);
    }
});

function updateNPCPosition(npcPED) {
    let ped = PlayerPedId();

    let [playerX, playerY, playerZ] = GetEntityCoords(ped, true);
    let [offsetX, offsetY, offsetZ] = GetOffsetFromEntityInWorldCoords(ped, 0, 2.0, -1.0);

    let dx = playerX - offsetX;
    let dy = playerY - offsetY;

    let heading = GetHeadingFromVector_2d(dx, dy);

    SetEntityCoords(npcPED, offsetX, offsetY, offsetZ, true, false, false, false);
    SetEntityHeading(npcPED, heading);
}

function updateVehPosition(veh) {
    let ped = PlayerPedId();

    let [playerX, playerY, playerZ] = GetEntityCoords(ped, true);
    let [offsetX, offsetY, offsetZ] = GetOffsetFromEntityInWorldCoords(ped, 0, 5.0, 0.0);

    let dx = playerX - offsetX;
    let dy = playerY - offsetY;

    let heading = GetHeadingFromVector_2d(dx, dy);

    SetEntityCoords(veh, offsetX, offsetY, offsetZ, true, false, false, false);
    SetEntityHeading(veh, heading);
}

function resetState() {
    state = {
        name: managementStates.NONE,
        data: {}
    };
}

function networkPed(ped, businessId) {
    emitNet('mrp:jobs:server:unregisterNetPed', GetPlayerServerId(PlayerId()), businessId);

    SetEntityCollision(ped, true, true);
    NetworkRegisterEntityAsNetworked(ped);
    let netId = PedToNet(ped);
    SetNetworkIdCanMigrate(netId, false);
    NetworkUseHighPrecisionBlending(netId, false);
    SetNetworkIdExistsOnAllMachines(netId, true);
    FreezeEntityPosition(ped, true);
    console.log(`Network ID [${netId}]`);

    let [pedX, pedY, pedZ] = GetEntityCoords(ped);
    let heading = GetEntityHeading(ped);

    let modelHash = GetEntityModel(ped);

    let obj = {
        businessId: businessId,
        signupLocation: {
            x: pedX,
            y: pedY,
            z: pedZ,
            heading: heading,
            modelHash: modelHash
        }
    };

    allJobs[businessId] = obj;

    emitNet('mrp:jobs:server:registerNetPed', GetPlayerServerId(PlayerId()), obj);
}

function setVehicleSpawnLocation(veh, businessId) {
    let [entX, entY, entZ] = GetEntityCoords(veh);
    let heading = GetEntityHeading(veh);

    let modelHash = GetEntityModel(veh);

    allJobs[businessId].vehicleSpawnLocation = {
        x: entX,
        y: entY,
        z: entZ,
        heading: heading,
        modelHash: modelHash
    };

    emitNet('mrp:jobs:server:registerVehicleSpawnLocation', GetPlayerServerId(PlayerId()), {
        businessId: businessId,
        vehicleSpawnLocation: {
            x: entX,
            y: entY,
            z: entZ,
            heading: heading,
            modelHash: modelHash
        }
    });
}

onNet('mrp:jobs:client:startJob', (job) => {
    console.log('Starting job...');

    let oid = ObjectID(Object.values(job._id.id)).toString();
    myJobs[oid] = job;

    emit('mrp_phone:showNotification', locale.startJob, 'job_start', false);
});

//management handling cycle
setInterval(() => {
    switch (state.name) {
        case managementStates.PLACE_NPC:
            if (state.data.ped) {
                DisableControlAction(1, 200, true); //disable ESC menu
                DisableControlAction(1, 38, true); //disable E pickup
                MRP_CLIENT.displayHelpText(locale.placeNPCHelpText);
                updateNPCPosition(state.data.ped);
            }
            if (IsDisabledControlJustReleased(1, 200)) {
                //ESC stop placing
                if (state.data.ped)
                    DeleteEntity(state.data.ped);
                resetState();
                EnableControlAction(1, 38, true);
                EnableControlAction(1, 200, true);
            }
            if (IsDisabledControlJustReleased(1, 38)) {
                //E pressed
                if (state.data.ped && state.data.businessId)
                    networkPed(state.data.ped, state.data.businessId);
                resetState();
                EnableControlAction(1, 38, true);
                EnableControlAction(1, 200, true);
            }
            break;
        case managementStates.PLACE_VEH:
            if (state.data.veh) {
                DisableControlAction(1, 200, true); //disable ESC menu
                DisableControlAction(1, 38, true); //disable E pickup
                MRP_CLIENT.displayHelpText(locale.placeVehHelpText);
                updateVehPosition(state.data.veh);
            }
            if (IsDisabledControlJustReleased(1, 200)) {
                //ESC stop placing
                if (state.data.veh)
                    DeleteEntity(state.data.veh);
                resetState();
                EnableControlAction(1, 38, true);
                EnableControlAction(1, 200, true);
            }
            if (IsDisabledControlJustReleased(1, 38)) {
                //E pressed
                setVehicleSpawnLocation(state.data.veh, state.data.businessId);
                if (state.data.veh)
                    DeleteEntity(state.data.veh);
                resetState();
                EnableControlAction(1, 38, true);
                EnableControlAction(1, 200, true);
            }
            break;
        default:
            break;
    }
}, 1);

//NPC handling cycle
setInterval(() => {
    for (let businessId in allJobs) {
        let job = allJobs[businessId];
        let oid = ObjectID(Object.values(job._id.id)).toString();
        let location = job.signupLocation;
        if (location) {
            let ped = PlayerPedId();
            let modelHash = location.modelHash;

            if (MRP_CLIENT.isNearLocation(ped, location.x, location.y, location.z) && MRP_CLIENT.isPedNearCoords(location.x, location.y, location.z, null, modelHash)) {
                let pedInFront = MRP_CLIENT.getPedInFront();
                let hasJob = myJobs[oid];
                if (pedInFront > 0) {
                    if (hasJob) {
                        emit('mrp:thirdeye:addMenuItem', {
                            jobId: oid,
                            id: 'get_mission_' + oid,
                            text: locale.getMission,
                            action: 'https://mrp_jobs/get_mission'
                        });
                        emit('mrp:thirdeye:removeMenuItem', {
                            id: 'signup_' + businessId
                        });
                    } else {
                        emit('mrp:thirdeye:addMenuItem', {
                            businessId: businessId,
                            id: 'signup_' + businessId,
                            text: locale.signup,
                            action: 'https://mrp_jobs/signup'
                        });
                        emit('mrp:thirdeye:removeMenuItem', {
                            id: 'get_mission_' + oid
                        });
                    }
                } else {
                    if (hasJob) {
                        emit('mrp:thirdeye:removeMenuItem', {
                            id: 'get_mission_' + oid
                        });
                    } else {
                        emit('mrp:thirdeye:removeMenuItem', {
                            id: 'signup_' + businessId
                        });
                    }
                }
            }
        }
    }
}, 0);

function isInVehicle(missionVehicle) {
    let ped = PlayerPedId();

    let veh = GetVehiclePedIsIn(ped, false);

    return veh == missionVehicle;
}

function nextStage(mission) {
    ClearAllBlipRoutes();
    let stages = config.missionStages[mission.type];
    let nextStageIndex = mission.currentStageIndex + 1;
    if (stages.length > nextStageIndex) {
        let nextStage = stages[nextStageIndex];
        mission.currentStage = nextStage;
        mission.currentStageIndex = nextStageIndex;
        mission.message = locale[nextStage];
        emit('mrp_phone:showNotification', mission.message, nextStage, true);
    } else {
        //TODO last stage
    }
}

function setWaypoint(wp, mission) {
    let blip = AddBlipForCoord(wp.x, wp.y, wp.z);
    SetBlipSprite(blip, 8);
    SetBlipScale(blip, 1.0);
    SetBlipAsShortRange(blip, true);
    SetBlipColour(blip, config.deliveryBlipColor);
    SetBlipRoute(blip, true);
    SetBlipRouteColour(blip, config.deliveryBlipColor);
    mission.waypointBlip = blip;
}

function handleDeliveryStages(mission) {
    if (!mission)
        return;

    switch (mission.currentStage) {
        case "getVehicle":
            if (isInVehicle(mission.vehicle)) {
                //next stage
                nextStage(mission);

                if (mission.currentStage == 'driveToLocation') {
                    //get random route
                    let routeIndex = utils.getRandomInt(0, mission.job.routes.length - 1);
                    let route = mission.job.routes[routeIndex];
                    mission.currentWaypoint = route;
                    setWaypoint(route, mission);
                }
            }
            break;
        case "driveToLocation":
            let ped = PlayerPedId();
            let wp = mission.currentWaypoint;
            if (MRP_CLIENT.isNearLocation(ped, wp.x, wp.y, wp.z, config.deliveryLocationArea)) {
                //next stage
                nextStage(mission);
            }
            break;
        default:
            break;
    }
}

//mission loop
setInterval(() => {
    for (let id in myMissions) {
        let mission = myMissions[id];
        switch (mission.type) {
            case missionTypes.DELIVERY:
                handleDeliveryStages(mission);
                break;
            default:
                break;
        }
    }
}, 0);