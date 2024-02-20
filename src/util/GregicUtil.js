function getTier(eu) {
    return Math.max(Math.floor(Math.log(eu) / Math.log(4)) - 2, 0);
}

const GregicUtil = {
    allTiers: {
        tj: ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UMV", "UXV", "MAX"],
        nomi: ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "MAX"],
        ceu: ["LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX"]
    },
    oc: function (eu, dur, type) {
        let t_dur = dur * 20,
            currTier = getTier(eu),
            mult;

        const tiers = GregicUtil.allTiers[type],
            out = [
                {
                    eu: eu,
                    dur: t_dur / 20,
                    t_dur: t_dur,
                    tier: tiers[currTier]
                }
            ];

        switch (type) {
            case "tj":
            case "nomi":
                if (eu <= 16) {
                    mult = 2;
                } else {
                    mult = 2.8;
                }
                break;
            case "ceu":
                mult = 2;
        }

        while (t_dur > 1 && currTier < tiers.length - 1) {
            t_dur = Math.floor(t_dur / mult);
            eu *= 4;
            currTier++;

            out.push({
                eu: eu,
                dur: t_dur / 20,
                t_dur: t_dur,
                tier: tiers[currTier]
            });
        }

        return out;
    }
};

export default GregicUtil;
