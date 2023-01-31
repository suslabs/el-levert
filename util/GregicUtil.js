const allTiers = {
    tj: ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UMV", "UXV", "MAX"],
    nomi: ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "MAX"],
    ceu: ["LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX"]
}

function baseLog(x, b) {
    return Math.log(x) / Math.log(b);
}

function oc(eu, dur, type) {
    const tiers = allTiers[type],
          out = [];

    let t_dur = dur * 20,
        currTier = Math.floor(baseLog(eu, 4));

    while(t_dur > 1 && currTier < tiers.length) {
        switch(type) {
        case "tj":
        case "nomi":
            t_dur /= 2.8;
            break;
        case "ceu":
            t_dur /= 2;
        }

        eu *= 4;
        currTier++;

        out.push({
            eu: eu,
            dur: t_dur / 20,
            tier: tiers[currTier]
        });
    }
}

export default oc;