fx_version 'cerulean'
game 'gta5'

author 'mufty'
description 'MRP Jobs module'
version '0.0.1'

dependencies {
    "mrp_employment",
}

files {
    'config/config.json',
}

shared_scripts {
    '@mrp_core/shared/debug.js',
    'lib/objectid.js',
    'lib/nanoid.js',
}

client_scripts {
    'client/*.js',
}

server_scripts {
    'server/*.js',
}