const database = require('../lib/database');
const roblox = require('../lib/roblox');
const {print, sleep} = require('../lib/globals');
const {options} = require("../lib/config");
const items = require("../lib/items");

const checkOutbounds = async () => {
    const outbounds = await database.getOutbounds();

    print(`checking ${outbounds.length.toLocaleString()} outbound trade${outbounds.length === 1 ? '' : 's'}...`, 'info')

    const tradeOptions = options().trading;
    const outboundOptions = options().bounds.outbounds;
    const maxOutboundAgeInHours = outboundOptions["max outbound age in hours"];
    const maxOutboundAgeInMs = maxOutboundAgeInHours * 60 * 60 * 1000;

    for (const outbound of outbounds) {
        const json = outbound.rawJSON;
        const tradeType = outbound.tradeType;
        const partnerId = outbound.partnerId;

        const itemsOffering = json.itemsOffering;
        const itemsRequesting = json.itemsRequesting;
        const offeringUaids = itemsOffering.map(i => i.uaid);

        const inventory = roblox.info().fullInventory;
        const ownedUaids = inventory.map(i => i.uaid);

        const decline = async () => {
            roblox.declineTrade(outbound.id);
            await outbound.destroy();
            await database.clearPlayerCooldown(partnerId);
        }

        if (offeringUaids.filter(i => !ownedUaids.includes(i)).length) {
            print(`declining ${outbound.id} as offering/requesting items are blacklisted`, 'info');
            await decline();
            continue;
        };
        if (outboundOptions["expire old outbounds"]) {
            if (outbound.createdAt.getTime() + maxOutboundAgeInMs < Date.now()) {
                print(`declining ${outbound.id} as it's more than ${maxOutboundAgeInHours.toLocaleString()} hour${maxOutboundAgeInHours === 1 ? '' : 's'} old`, 'info');
                await decline();
                continue;
            }
        }

        let valueOffering = 0;
        let rapOffering = 0;
        let offeringBlacklisted = false;

        for (const oldItem of itemsOffering) {
            const item = items.get(oldItem.id);

            if (!item.whitelist.offer)
                offeringBlacklisted = true;

            valueOffering += item.offer || item.value;
            rapOffering += item.rap;
        }

        let valueRequesting = 0;
        let rapRequesting = 0;
        let requestingBlacklisted = false;

        for (const oldItem of itemsRequesting) {
            const item = items.get(oldItem.id);

            if (!item.whitelist.request)
                requestingBlacklisted = true;

            valueRequesting += item.request || item.value;
            rapRequesting += item.rap;
        }

        if (offeringBlacklisted || requestingBlacklisted) {
            print(`declining ${outbound.id} as offering/requesting items are blacklisted`, 'info');

            await decline();
            continue;
        }

        const tradeTypeOptions = tradeOptions[tradeType];
        const minimumValueGain = valueOffering * tradeTypeOptions['minimum value gain'];
        const minimumRapGain = valueOffering * tradeTypeOptions['minimum rap gain'];

        if (
            (valueRequesting >= minimumValueGain) &&
            (rapRequesting >= minimumRapGain)
        ) {
            // console.log('outbound', outbound.id, 'is still a win')
        } else {
            print(`declining ${outbound.id} as it's a loss (${valueOffering.toLocaleString()} vs ${valueRequesting.toLocaleString()})`, 'error')

            await decline();
            continue;
        }
    }
}

const main = async () => {
    for (;;) {
        await checkOutbounds();
        await sleep(5 * 1000);
    }
}

module.exports = main;
