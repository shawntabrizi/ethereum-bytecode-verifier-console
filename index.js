#!/usr/bin/env node
const program = require('commander');

const {verifier} = require('./src/verifier');

program
    .option('-n, --network <network>', 'Ethereum Network: mainnet, ropsten, kovan, rinkeby')
    .option('-s, --solc <version>', 'Solc Version: e.g. v0.4.10+commit.f0d539ae')
    .option('-f, --file <file>', 'Filename: e.g. MultiSigWalletWithDailyLimit.sol')
    .option('-c, --contract <name>', 'Contract name: e.g. MultiSigWalletWithDailyLimit')
    .option('-a, --address <address>', 'Contract Address: e.g. 0x851b7f3ab81bd8df354f0d7640efcd7288553419')
    .option('-o, --optimized', 'Optimized')
    .action(function() {

        const net_to_provider = {
            'mainnet':'https://mainnet.infura.io',
            'ropsten': 'https://ropsten.infura.io',
            'kovan': 'https://kovan.infura.io',
            'rinkeby': 'https://rinkeby.infura.io',
        }

        var provider = net_to_provider[program.network]

        var settings = {
            'file_folder': process.cwd(),
            'solc_version': program.solc,
            'file_name': program.file,
            'contract_name': program.contract ? program.contract : program.file.slice(0, -4),
            'contract_address': program.address,
            'is_optimized': program.optimized ? 1 : 0
        }

        verifier(settings, provider);
    })
    .parse(process.argv);