# Kredits toggl

A Kredits oracle for [toggl.com](http://toggl.com/) time tracking entries.

This script reads time entries from toggl for specific projects and specific timeframe and creates Kredits contribution entries for those.

By default 1 minute will result in 1 contribution token.


## Installation

    $ npm install
    
## Run it

### Options:

Configuration options are set via environment variables: (also see the Config variable in index.js)

* TOGGL_API_TOKEN: (required) toggle.com API token
* WORKSPACE_ID: (required) toggl.com workspace ID
* PROJECT_IDS: toggl.com project IDs as comma separated string
* DAO_ADDRESS: (required) Kredits DAO address
* ETH_NETWORK: Ethereum network: local, rinkeby, etc. 
* ETH_RPC_URL: Ethereum RPC URL (default: http://localhost:7545)
* APM_DOMAIN: Aragon APM domain (default: aragonpm.eth)

Contributors must have a `{ site: 'toggl.com', uid: TOGGLE_USER_ID, username: '' }` accounts entry. 

If a `claimedLabel` is set all time entries will be tagged and ignored in future runs. 

The script also creates a `last-import.txt` file with a timestamp which will be used as `since` parameter in future runs.

    $ node index.js
 
 
