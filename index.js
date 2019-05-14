const request = require('request-promise-native');
const moment = require('moment');
const fs = require('fs');
const Kredits = require('kredits-contracts');
const ethers = require('ethers');

const Config = {
  claimedLabel: 'kredits-claimed',
  reportParams: {
    workspace_id: process.env.WORKSPACE_ID,
    project_ids: process.env.PROJECT_IDS,
    user_agent: 'kredits-oracle'
  },
  apmDomain: process.env.APM_DOMAIN || 'aragonpm.eth',
  daoAddress: process.env.DAO_ADDRESS,
  ethNetwork: process.env.ETH_NETWORK,
  ethRpcUrl: process.env.ETH_RPC_URL || 'http://localhost:7545',
  toggleApiToken: process.env.TOGGL_API_TOKEN

};

const reportFilter = {
  billable: true,
  workspace_id: Config.workspace_id,
  project_ids: Config.project_ids,
};

function addTimeContribution(kredits, contributor) {
  let start = moment().subtract(1, 'week');
  if (fs.existsSync('last-import.txt')) {
    var timestamp = fs.readFileSync('last-import.txt');
    start = moment(timestamp, 'x');
  }
  const end = moment();

  const togglUserId = contributor.accounts.find(a => a.site === 'toggl.com').uid;
  let filters = Config.reportParams;
  filters.user_ids = togglUserId;
  filters.since = start.format('YYYY-MM-DD');
  filters.util = end.format('YYYY-MM-DD');

  console.log(`Contributor: ${contributor.id}: filters:`, filters);

  return request.get('https://toggl.com/reports/api/v2/details', { qs: filters }).auth(Config.toggleApiToken, 'api_token').then(response => {

    const report = JSON.parse(response);
    let timeEntries = report.data;
    let entriesToClaim = timeEntries;
    if (Config.claimedLabel) {
      entriesToClaim = timeEntries.filter(e => !e.tags || !e.tags.includes(Config.claimedLabel));
    }
    console.log(`Contributor ${contributor.id }: found ${entriesToClaim.length} claimable entries out of ${timeEntries.length} total.`);

    if (entriesToClaim.length > 0) {
      const totalMilliseconds = entriesToClaim.map(e => e.dur).reduce((accumulator, current) => { accumulator + current });
      const amount = Math.ceil(totalMilliseconds / 1000 / 60);
      console.log(`Contributor ${contributor.id}: amount: ${amount} minutes`);

      let contributionAttr = {
        amount: amount,
        contributorId: contributor.id,
        contributorIpfsHash: contributor.ipfsHash,
        time: end.format('hh:mm:ssZ'),
        date: end.format("YYYY-MM-DD"),
        description: `[toggl.com] ${amount} minutes logged between ${start.format('YYYY-MM-DD hh:mm:ss')} and ${end.format('YYYY-MM-DD hh:mm:ss')}`,
        details: {
          start: start.format('YYYY-MM-DD hh:mm:ss'),
          end: end.format('YYYY-MM-DD hh:mm:ss'),
          time_entries: entriesToClaim.map(e => { return { id: e.id, dur: e.dur, start: e.start, end: e.end }})
        },
        kind: 'dev',
        url: ''
      };

      fs.writeFileSync('last-import.txt', end.format('x'));

      return kredits.Contribution.addContribution(contributionAttr, { gasLimit: 300000 }).then(tx => {
        console.log(`Contributor: ${contributor.id}: published contribution ${tx.hash}`);

        if (Config.claimedLabel) {
          return request.put(
            'https://www.toggl.com/api/v8/time_entries/' + entriesToClaim.map(e => e.id).join(','),
            { json: { time_entry: {tags: [Config.claimedLabel], tag_action: 'add' }} }
          ).auth(Config.toggleApiToken, 'api_token')
        } else {
          return Promise.resolve();
        }
      });
    } else {
      console.log(`Contributor: ${contributor.id}: no claimable entries found`);
      return Promise.resolve();
    }
  });
};

Kredits.for = function (connectionOptions, kreditsOptions) {
  const { network, rpcUrl, wallet } = connectionOptions;
  if (!rpcUrl && network === 'local') { rpcUrl = 'http://localhost:8545'; }
  let ethProvider, signer;
  if (rpcUrl || network === 'local') {
    ethProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
  } else {
    ethProvider = new ethers.getDefaultProvider(network);
  }
  if (wallet) {
    signer = wallet.connect(ethProvider);
  } else if (ethProvider.getSigner) {
    signer = ethProvider.getSigner();
  }
  return new Kredits(ethProvider, signer, kreditsOptions);
}

let wallet = null;
Kredits.for(
  { rpcUrl: Config.ethRpcUrl, network: Config.ethNetwork, wallet: wallet },
  {
    addresses: { Kernel: Config.daoAddress },
    apm: Config.apmDomain,
    ipfsConfig: Config.ipfsConfig
  }
).init().then(kredits => {
  kredits.Contributor.all().then(contributors => {
    const contributorsWithToggl = contributors.filter(c => c.accounts.find(a => a.site === 'toggl.com'));
    contributorsWithToggl.forEach(async (contributor) => {
      try {
        await addTimeContribution(kredits, contributor);
      } catch(e) {
        console.log(e);
      }
    })
  });
});
