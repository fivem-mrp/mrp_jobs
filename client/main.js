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

let state = {
    name: managementStates.NONE,
    data: {}
};

let mission = {};

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
    //TODO
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
        let location = job.signupLocation;
        if (location) {
            let ped = PlayerPedId();
            let modelHash = location.modelHash;

            if (MRP_CLIENT.isNearLocation(ped, location.x, location.y, location.z) && MRP_CLIENT.isPedNearCoords(location.x, location.y, location.z, null, modelHash)) {
                let pedInFront = MRP_CLIENT.getPedInFront();
                if (pedInFront > 0) {
                    emit('mrp:thirdeye:addMenuItem', {
                        businessId: businessId,
                        id: 'signup_' + businessId,
                        text: locale.signup,
                        action: 'https://mrp_jobs/signup'
                    });
                } else {
                    emit('mrp:thirdeye:removeMenuItem', {
                        id: 'signup_' + businessId
                    });
                }
            }
        }
    }
}, 0);