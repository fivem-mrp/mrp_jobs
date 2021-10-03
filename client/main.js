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
    PLACE_VEH: "PLACE_VEH",
    REMOVE_DELIVERY_ROUTE: "REMOVE_DELIVERY_ROUTE"
};

const missionTypes = {
    DELIVERY: "delivery",
    CARGO: "cargo",
    CARTING: "carting"
};

let state = {
    name: managementStates.NONE,
    data: {}
};

let myJobs = {};
let myMissions = {};
let allJobs = {};

let getRandomPed = () => {
    let peds = exports["mrp_core"].EnumeratePeds();
    let randomIndex = utils.getRandomInt(0, peds.length - 1);
    let ped = peds[randomIndex];
    let netIndex = NetworkGetPlayerIndexFromPed(ped);
    if (netIndex != -1)
        ped = getRandomPed();

    //mission NPCs are shared spawns for stuff like shop keepers
    if (IsEntityAMissionEntity(ped))
        ped = getRandomPed();

    return ped;
};

let stateTransitions = {
    onGetVehicle: function() {
        let job = this.job;
        let asyncStart = async () => {
            if (!this.vehicle) {
                if (this.type == missionTypes.CARTING) {
                    let [veh, cart] = await spawnCart(job.vehicleSpawnLocation.x, job.vehicleSpawnLocation.y, job.vehicleSpawnLocation.z, job.vehicleSpawnLocation.heading);
                    this.vehicle = veh;
                    this.interactObject = cart;
                    this.spawnedEntities = [cart];
                } else {
                    RequestModel(job.vehicleSpawnLocation.modelHash);
                    while (!HasModelLoaded(job.vehicleSpawnLocation.modelHash)) {
                        await utils.sleep(100);
                    }

                    let veh = CreateVehicle(job.vehicleSpawnLocation.modelHash, job.vehicleSpawnLocation.x, job.vehicleSpawnLocation.y, job.vehicleSpawnLocation.z, job.vehicleSpawnLocation.heading, true, true);
                    let plate = GetVehicleNumberPlateText(veh).trim();

                    //TODO group
                    emitNet('mrp:vehicle:server:giveKeys', [GetPlayerServerId(PlayerId())], plate);

                    this.vehicle = veh;
                }
            }

            if (!this.blip) {
                let blip = AddBlipForEntity(this.vehicle);
                SetBlipSprite(blip, this.blipIcon);
                SetBlipScale(blip, 1.0);
                SetBlipAsShortRange(blip, true);
                SetBlipColour(blip, this.blipColor);
                this.blip = blip;
            }

            SetBlipRoute(this.blip, true);
            SetBlipRouteColour(this.blip, this.blipColor);

            let msg = locale[this.state];

            emit('mrp_phone:showNotification', msg, "job_mission_" + this.state, true);
        };

        //TODO need to disable for now
        /*if (!this.transitionHistory)
            this.transitionHistory = [];

        this.transitionHistory.push('getVehicle');*/

        asyncStart();
    },
    checkGettingVehicle: function() {
        if (isInVehicle(this.vehicle)) {
            //next stage
            nextStage(this);
        }
    },
    onSetupCorner: function() {
        console.debug(`Setup corner`);
        let oid = ObjectID(Object.values(this.job._id.id)).toString();
        emit('mrp:radial_menu:addMenuItem', {
            id: 'job_start_cornering_' + oid,
            text: locale.startCornering,
            persist: true,
            action: 'https://mrp_jobs/job_start_cornering'
        });
    },
    checkSettingUpCorner: function() {
        if (this.cornerSetup) {
            //next stage
            nextStage(this);
        }
    },
    onCorner: function() {
        let oid = ObjectID(Object.values(this.job._id.id)).toString();
        emit('mrp:radial_menu:removeMenuItem', {
            id: 'job_start_cornering_' + oid
        });
        emit('mrp:radial_menu:addMenuItem', {
            id: 'job_stop_cornering_' + oid,
            text: locale.stopCornering,
            persist: true,
            action: 'https://mrp_jobs/job_stop_cornering'
        });
    },
    checkCornering: function() {
        let oid = ObjectID(Object.values(this.job._id.id)).toString();
        if (!this.cornerSetup) {
            //next stage
            nextStage(this);
            emit('mrp:thirdeye:removeMenuItem', {
                id: 'craft_mission_' + oid
            });
            return;
        }

        let lookingAt = MRP_CLIENT.getObjectInFront();
        if (lookingAt && lookingAt == this.interactObject) {
            console.debug(`Looking at cart`);
            emit('mrp:thirdeye:addMenuItem', {
                jobId: oid,
                id: 'craft_mission_' + oid,
                text: locale.craftHotdog,
                action: 'https://mrp_jobs/craft_hotdog'
            });
        } else {
            emit('mrp:thirdeye:removeMenuItem', {
                id: 'craft_mission_' + oid
            });
        }

        //Check looking at customer
        let lookingAtPED = MRP_CLIENT.getPedInFront();
        if (lookingAtPED && this.npcs && this.npcs.indexOf(lookingAtPED) != -1) {
            console.debug(`Looking at NPC customer`);
            emit('mrp:inventory:client:hasItem', this.craftItem, (count) => {
                if (count > 0) {
                    console.debug("Has hotdog");
                    emit('mrp:thirdeye:addMenuItem', {
                        jobId: oid,
                        ped: lookingAtPED,
                        id: 'give_item_mission_' + oid,
                        text: locale.giveItem,
                        action: 'https://mrp_jobs/give_item_mission'
                    });
                }
            });
        } else {
            emit('mrp:thirdeye:removeMenuItem', {
                id: 'give_item_mission_' + oid
            });
        }

        let timeout = utils.getRandomInt(this.corneringRandomInterval[0], this.corneringRandomInterval[1]);
        if (!this.timer) {
            this.timer = true;
            this.timer = setTimeout(() => {
                //clear timer
                this.timer = null;
                let exec = async () => {
                    let randomPed = getRandomPed();
                    if (!this.npcs)
                        this.npcs = [];
                    TaskGoToEntity(randomPed, this.interactObject, -1, 2.0, 2.0, 1073741824, 0);
                    SetPedKeepTask(randomPed, true);
                    while (GetScriptTaskStatus(randomPed, 0x4924437D) != 7) {
                        //wait until NPC in vehicle
                        await utils.sleep(100);
                    }
                    TaskStandStill(randomPed, -1);
                    this.npcs.push(randomPed);
                };
                exec();
            }, timeout);
        }
    },
    onDriveToLocation: function() {
        //get random route
        let routeIndex = utils.getRandomInt(0, this.job.routes.length - 1);
        let route = this.job.routes[routeIndex];
        this.currentWaypoint = route;
        setWaypoint(route, this);

        if (!this.transitionHistory)
            this.transitionHistory = [];

        this.transitionHistory.push('driveToLocation');
    },
    checkDrivingToLocation: function() {
        let ped = PlayerPedId();
        let wp = this.currentWaypoint;
        if (MRP_CLIENT.isNearLocation(ped, wp.x, wp.y, wp.z, this.locationAOE)) {
            //next stage
            nextStage(this);
        }
    },
    onGetShipmentFromVehicle: function() {
        if (!this.transitionHistory)
            this.transitionHistory = [];

        this.transitionHistory.push('getShipmentFromVehicle');
    },
    checkGettingShipment: function() {
        let ped = PlayerPedId();
        let [trunkposX, trunkposY, trunkposZ] = GetWorldPositionOfEntityBone(this.vehicle, GetEntityBoneIndexByName(this.vehicle, "taillight_l"));
        MRP_CLIENT.drawText3D(trunkposX, trunkposY, trunkposZ, locale.trunk);
        let [pX, pY, pZ] = GetEntityCoords(ped);
        let distanceToTrunk = Vdist(pX, pY, pZ, trunkposX, trunkposY, trunkposZ);
        if (distanceToTrunk <= this.distanceToTrunk) {
            MRP_CLIENT.displayHelpText(locale.deliveryGetShipmentHelp);
            if (IsControlJustPressed(1, 38)) {
                //next stage
                nextStage(this);

                let prop = MRP_CLIENT.createProp('hei_prop_heist_box', 60309, {
                    xPos: 0.025,
                    yPos: 0.08,
                    zPos: 0.255,
                    xRot: -145.0,
                    yRot: 290.0,
                    zRot: 0.0
                });

                this.prop = prop;

                emit("mrp:lua:taskPlayAnim", ped, 'anim@heists@box_carry@', "idle", 8.0, -8.0, -1, 48, 0, false, false, false);
            }
        }
    },
    onDropShipment: function() {
        if (!this.transitionHistory)
            this.transitionHistory = [];

        this.transitionHistory.push('dropShipment');
    },
    checkDroppingShipment: function() {
        if (!this.currentWaypoint)
            return;

        let ped = PlayerPedId();
        let [pX, pY, pZ] = GetEntityCoords(ped);
        let distanceToDropoff = Vdist(pX, pY, pZ, this.currentWaypoint.x, this.currentWaypoint.y, this.currentWaypoint.z);
        if (distanceToDropoff <= this.distanceToDropoff) {
            MRP_CLIENT.displayHelpText(locale.deliveryDropoffShipmentHelp);
            if (IsControlJustPressed(1, 38)) {
                //next stage
                nextStage(this);

                ClearPedSecondaryTask(ped);
                if (this.prop) {
                    DeleteObject(this.prop);
                }
            }
        }
    },
    onReturnVehicle: function() {
        let route = this.job.vehicleSpawnLocation;
        this.currentWaypoint = route;
        setWaypoint(route, this);

        if (!this.transitionHistory)
            this.transitionHistory = [];

        this.transitionHistory.push('returnVehicle');
    },
    checkReturningVehicle: function() {
        let ped = PlayerPedId();
        let wp = this.currentWaypoint;
        if (MRP_CLIENT.isNearLocation(ped, wp.x, wp.y, wp.z, this.locationAOE)) {
            //next stage
            nextStage(this);
        }
    },
    onParkVehicle: function() {
        if (!this.transitionHistory)
            this.transitionHistory = [];

        this.transitionHistory.push('parkVehicle');
    },
    checkParkingVehicle: function() {
        let ped = PlayerPedId();
        let wp = this.currentWaypoint;
        if (MRP_CLIENT.isNearLocation(ped, wp.x, wp.y, wp.z, this.locationAOE)) {
            MRP_CLIENT.displayHelpText(locale.deliveryReturnVehicleHelp);
            if (IsControlJustPressed(1, 38)) {
                //next stage
                nextStage(this);

                if (this.vehicle)
                    DeleteEntity(this.vehicle);
            }
        }
    },
    onEnd: function() {
        if (this.job) {
            let job = this.job;

            let oid = ObjectID(Object.values(job._id.id)).toString();
            delete myMissions[oid];

            if (this.paycut && this.cost) {
                let payCut = (this.paycut / 100) * this.cost;
                let businessCut = this.cost - payCut;
                let char = MRP_CLIENT.GetPlayerData();

                if (this.type == missionTypes.CARTING) {
                    if (!this.npcSoldCounter)
                        this.npcSoldCounter = 0;

                    if (!this.itemsCreatedCounter)
                        this.itemsCreatedCounter = 0;

                    payCut = payCut * this.npcSoldCounter;
                    businessCut = businessCut * this.itemsCreatedCounter;

                    //count premium sales
                    if (this.npcSoldPremiumCounter && this.premiumExtraPay) {
                        paycut += this.premiumExtraPay * this.npcSoldPremiumCounter;
                    }
                }

                //pay employee
                emitNet('mrp:bankin:server:deposit:byowner', {
                    owner: char._id,
                    origin: job.businessId,
                    ammount: payCut
                });

                let paymsg = locale.payPrefix + payCut + "$";
                emit('mrp_phone:showNotification', paymsg, 'job_pay', false);

                //pay business
                emitNet('mrp:bankin:server:deposit:byowner', {
                    owner: job.businessId,
                    origin: char._id,
                    ammount: businessCut
                });
            }

            if (this.spawnedEntities) {
                //cleanup spawned stuff
                for (let entity of this.spawnedEntities) {
                    DeleteEntity(entity);
                }
            }
        }
    }
};

let getAllJobs = () => {
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
                }, (ped) => {
                    let obj = {
                        businessId: oid,
                        signupLocation: {
                            x: sl.x,
                            y: sl.y,
                            z: sl.z,
                            heading: sl.heading,
                            modelHash: sl.modelHash
                        },
                        netId: PedToNet(ped)
                    };

                    if (r.vehicleSpawnLocation)
                        obj.vehicleSpawnLocation = r.vehicleSpawnLocation;

                    emitNet('mrp:jobs:server:registerNetPed', GetPlayerServerId(PlayerId()), obj, false);
                });
            }
        }
    });
};

onNet('mrp:spawn', () => {
    getAllJobs();
});

onNet('mrp:jobs:client:registerJob', (r) => {
    let oid = ObjectID(Object.values(r.businessId.id)).toString();
    console.log(`Register job for business [${oid}]`);
    allJobs[oid] = r;
});

function fillRadialMenu(businesses) {
    if (businesses && businesses.length > 0) {
        for (let business of businesses) {
            let submenu = [];
            if (business) {
                let id = "set_signup_location";
                if (business._id && business._id.id) {
                    id = ObjectID(Object.values(business._id.id)).toString();
                }

                if (business.type == missionTypes.DELIVERY) {
                    submenu.push({
                        id: 'job_add_delivery_destination_' + id,
                        text: locale.addDeliveryDestination,
                        action: 'https://mrp_jobs/add_delivery_destination'
                    });

                    submenu.push({
                        id: 'job_remove_delivery_destination_' + id,
                        text: locale.removeDeliveryDestination,
                        action: 'https://mrp_jobs/remove_delivery_destination'
                    });
                }

                if (business.type == missionTypes.DELIVERY || business.type == missionTypes.CARTING) {
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
                        id: 'job_management_' + id,
                        text: business.name,
                        submenu: submenu,
                        persist: true,
                        action: 'https://mrp_jobs/job_management'
                    });
                }
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

RegisterNuiCallbackType('give_item_mission');
on('__cfx_nui:give_item_mission', (data, cb) => {
    cb({});
    if (data.ped) {
        ClearPedTasks(data.ped);
    }

    let id = data.id.replaceAll("give_item_mission_", "");
    let sm = myMissions[id];
    if (sm && !sm.npcSoldCounter) {
        sm.npcSoldCounter = 1;
    } else if (sm && sm.npcSoldCounter >= 0) {
        sm.npcSoldCounter++;
    }

    let playerPed = PlayerPedId();
    let [x, y, z] = GetEntityCoords(playerPed);
    let [streetNameHash] = GetStreetNameAtCoord(x, y, z);
    let streetName = GetStreetNameFromHashKey(streetNameHash);
    if (sm && sm.premiumStreets && sm.premiumStreets.indexOf(streetName) != -1) {
        //Selling on premium street
        if (sm && !sm.npcSoldPremiumCounter) {
            sm.npcSoldPremiumCounter = 1;
        } else if (sm && sm.npcSoldPremiumCounter >= 0) {
            sm.npcSoldPremiumCounter++;
        }
    }

    emitNet('mrp:inventory:server:RemoveItem', sm.craftItem, sm.turnAmmount);
});

let craftMission = null;
RegisterNuiCallbackType('craft_hotdog');
on('__cfx_nui:craft_hotdog', (data, cb) => {
    cb({});
    let id = data.id.replaceAll("craft_mission_", "");
    let sm = myMissions[id];
    if (sm && !sm.itemsCreatedCounter) {
        sm.itemsCreatedCounter = 1;
    } else if (sm && sm.itemsCreatedCounter >= 0) {
        sm.itemsCreatedCounter++;
    }

    craftMission = sm;

    let ped = PlayerPedId();
    FreezeEntityPosition(ped, true);
    TaskStartScenarioInPlace(ped, 'PROP_HUMAN_BBQ', 0, true);
    emit('mrp:startTimer', {
        timer: sm.craftTimer,
        timerAction: 'https://mrp_jobs/crafting_done'
    });
});

RegisterNuiCallbackType('crafting_done');
on('__cfx_nui:crafting_done', (data, cb) => {
    cb({});
    let ped = PlayerPedId();
    FreezeEntityPosition(ped, false);
    ClearPedTasks(ped);
    emitNet('mrp:inventory:server:AddItem', craftMission.craftItem, craftMission.craftAmmount);
    craftMission = null;
});

RegisterNuiCallbackType('job_start_cornering');
on('__cfx_nui:job_start_cornering', (data, cb) => {
    cb({});

    let id = data.id.replaceAll("job_start_cornering_", "");
    let sm = myMissions[id];
    sm.cornerSetup = true;
});

RegisterNuiCallbackType('job_stop_cornering');
on('__cfx_nui:job_stop_cornering', (data, cb) => {
    cb({});

    let id = data.id.replaceAll("job_stop_cornering_", "");
    let sm = myMissions[id];
    sm.cornerSetup = false;
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

RegisterNuiCallbackType('remove_delivery_destination');
on('__cfx_nui:remove_delivery_destination', (data, cb) => {
    cb({});

    let id = data.id.replaceAll("job_remove_delivery_destination_", "");

    MRP_CLIENT.TriggerServerCallback('mrp:jobs:server:getJobById', [id], (result) => {
        if (!result) {
            console.log(`No job found for business id [${id}]`);
            return;
        }

        if (!result.routes || result.routes.length == 0) {
            console.log('No routes yet');
            return;
        }

        let i = 1;
        let blips = [];
        for (let r of result.routes) {
            let blip = AddBlipForCoord(r.x, r.y, r.z);
            SetBlipColour(blip, config.waypointBlipColor);
            SetBlipAsShortRange(blip, true);
            ShowNumberOnBlip(blip, i);
            blips.push({
                blip: blip,
                x: r.x,
                y: r.y,
                z: r.z
            });
            i++;
        }

        state = {
            name: managementStates.REMOVE_DELIVERY_ROUTE,
            data: {
                businessId: id,
                blips: blips
            }
        };

        emit('chat:addMessage', {
            template: '<div class="chat-message nonemergency">{0}</div>',
            args: [
                locale.pointsAddedToMap
            ]
        });
    });
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

function getCheckFunctionName(state) {
    let stateName = state.charAt(0).toUpperCase() + state.slice(1);
    let checkStateName = "check" + stateName;
    return checkStateName;
}

function startMission(mission) {
    if (!mission || !mission.data || !mission.data.job)
        return;

    let job = mission.data.job;

    let oid = ObjectID(Object.values(job._id.id)).toString();

    let stages = config.missionStages[mission.type];

    let methods = {};

    for (let i in stages.transitions) {
        let transition = stages.transitions[i];
        let name = transition.name;
        let state = transition.to;
        let transName = name.charAt(0).toUpperCase() + name.slice(1);
        let stateName = state.charAt(0).toUpperCase() + state.slice(1);
        let onTransitionName = "on" + transName;
        let checkStateName = "check" + stateName;
        let onFunction = stateTransitions[onTransitionName];
        let checkFunction = stateTransitions[checkStateName];

        methods[onTransitionName] = onFunction;
        methods[checkStateName] = checkFunction;
    }

    let sm = stages;
    sm.methods = methods;
    if (!sm.data)
        sm.data = {};

    sm.data.type = mission.type;
    sm.data.job = job;

    let fsm = new StateMachine(sm);

    myMissions[oid] = fsm;
}

onNet('mrp:jobs:client:startMission', (mission) => {
    console.debug('mrp:jobs:client:startMission');
    if (!mission)
        return;

    switch (mission.type) {
        case missionTypes.DELIVERY:
            startMission(mission);
            break;
        case missionTypes.CARTING:
            startMission(mission);
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

    console.log(`Get mission`);
    if (data.jobId) {
        console.log(`Getting job [${data.jobId}]`);
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
        },
        netId: netId
    };

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
    let oid = ObjectID(Object.values(job._id.id)).toString();
    console.log(`Starting job... ${oid}`);
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
        case managementStates.REMOVE_DELIVERY_ROUTE:
            if (IsWaypointActive()) {
                let [waypointCoordsX, waypointCoordsY, waypointCoordsZ] = GetBlipInfoIdCoord(GetFirstBlipInfoId(8));
                SetWaypointOff();
                if (state.data && state.data.blips) {
                    let foundBlip;
                    for (let blipData of state.data.blips) {
                        let [blipX, blipY, blipZ] = GetBlipInfoIdCoord(blipData.blip);
                        if (blipX == waypointCoordsX && blipY == waypointCoordsY) {
                            foundBlip = blipData;
                        }
                        RemoveBlip(blipData.blip);
                    }

                    if (foundBlip) {
                        emitNet('mrp:jobs:server:removeDeliveryDestination', {
                            x: foundBlip.x,
                            y: foundBlip.y,
                            z: foundBlip.z
                        }, state.data.businessId);
                    }
                }

                resetState();
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

        if (!job || !job._id) {
            console.debug("No job or job._id");
            continue;
        }

        let oid = ObjectID(Object.values(job._id.id)).toString();
        let location = job.signupLocation;
        if (location) {
            let ped = PlayerPedId();
            let modelHash = location.modelHash;

            if (MRP_CLIENT.isNearLocation(ped, location.x, location.y, location.z, config.signupArea) && MRP_CLIENT.isPedNearCoords(location.x, location.y, location.z, null, modelHash)) {
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

    let transitions = mission.transitions();
    for (let i in transitions) {
        let trans = transitions[i];
        if (!mission.transitionHistory || mission.transitionHistory.indexOf(trans) == -1) {
            mission[trans]();

            let msg = locale[mission.state];

            if (msg)
                emit('mrp_phone:showNotification', msg, "job_mission_" + mission.state, true);

            break;
        }
    }
}

function setWaypoint(wp, mission) {
    let blip = AddBlipForCoord(wp.x, wp.y, wp.z);
    SetBlipSprite(blip, 8);
    SetBlipScale(blip, 1.0);
    SetBlipAsShortRange(blip, true);
    SetBlipColour(blip, mission.blipColor);
    SetBlipRoute(blip, true);
    SetBlipRouteColour(blip, mission.blipColor);
    mission.waypointBlip = blip;
}

function handleStates(sm) {
    if (!sm)
        return;

    if (sm.state == "start") {
        let transitions = sm.transitions();
        if (transitions && transitions.length == 1) {
            let firstTransition = transitions[0];
            sm[firstTransition]();
        } else {
            console.log('Too many start transitions');
        }
    } else if (sm.state == "end") {
        //TODO end
    } else {
        let checkFunctionName = getCheckFunctionName(sm.state);
        if (sm[checkFunctionName])
            sm[checkFunctionName]();
    }
}

//mission loop
setInterval(() => {
    for (let id in myMissions) {
        let mission = myMissions[id];
        handleStates(mission);
    }
}, 0);

let spawnCart = async (x, y, z, heading) => {
    //bicycle
    let bicycleHash = GetHashKey('cruiser');
    RequestModel(bicycleHash);
    while (!HasModelLoaded(bicycleHash)) {
        await utils.sleep(100);
    }

    let veh = CreateVehicle(bicycleHash, x, y, z, heading, true, true);

    //cart
    let cart = CreateObject(GetHashKey('prop_burgerstand_01'), x, y, z, true, true);
    SetEntityAsMissionEntity(cart, true, true);

    //attach ... yes bicycles have exhaust
    AttachEntityToEntity(cart, veh, GetEntityBoneIndexByName(veh, 'exhaust'), 0.0, -1.8, -0.575, 0.0, 0.0, -90.0, true, false, true, false, 0, true);

    return [veh, cart];
}

//TESTING ONLY
RegisterCommand('spawnCart', () => {
    let ped = PlayerPedId();

    let [playerX, playerY, playerZ] = GetEntityCoords(ped, true);
    let [offsetX, offsetY, offsetZ] = GetOffsetFromEntityInWorldCoords(ped, 0, 5.0, 0);

    let dx = playerX - offsetX;
    let dy = playerY - offsetY;

    let heading = GetHeadingFromVector_2d(dx, dy);

    spawnCart(offsetX, offsetY, offsetZ, heading);
});