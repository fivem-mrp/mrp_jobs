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
    PLACE_NPC: "PLACE_NPC"
};

let state = {
    name: managementStates.NONE,
    data: {}
};

function fillRadialMenu(businesses) {
    if (businesses && businesses.length > 0) {
        for (let business of businesses) {
            let submenu = [];
            if (business && business.type == "delivery") {
                submenu.push({
                    id: 'job_creation_start',
                    text: locale.startJobCreation,
                    action: 'https://mrp_jobs/creation_start'
                });

                let id = "set_signup_location";
                if (business._id && business._id.id) {
                    id = ObjectID(Object.values(business._id.id)).toString();
                }
                submenu.push({
                    id: id,
                    text: locale.setSignupLocation,
                    action: 'https://mrp_jobs/set_signup_location'
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


RegisterNuiCallbackType('set_signup_location');
on('__cfx_nui:set_signup_location', (data, cb) => {
    data.id = data.id.replaceAll("_", " "); // replace underscores for spaces back

    emit("mrp:jobs:client:set_signup_location", data);

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

RegisterNuiCallbackType('set_signup_location_confirm');
on('__cfx_nui:set_signup_location_confirm', (data, cb) => {
    cb({});

    if (state.name == managementStates.NONE)
        startPlacinngNPC(data.jobSignupPED, data.businessId);
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

    emitNet('mrp:jobs:server:registerNetPed', GetPlayerServerId(PlayerId()), netId, businessId);
}

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
        default:
            break;
    }
}, 1);