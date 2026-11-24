## GregTech CEu voltage tiers (ULV, LV, MV, HV, EV, IV, LuV, ZPM, UV, UHV, MAX) and EU/t per amp

Nomifactory CEu (Nomi-CEu, current release 1.7.7) runs GregTech Community Edition Unofficial (GTCEu) version 2.8.10 with Gregicality Multiblocks (GCYM). Everything in this reference is for those versions and Nomi-CEu's own configs. Power is EU (Energy Units): voltage is the EU per packet (EU/t per amp) and amperage (A) is packets per tick. 20 ticks = 1 second. Each tier is 4x the one before:

- ULV (Ultra Low Voltage): 8 EU/t
- LV (Low Voltage): 32 EU/t
- MV (Medium Voltage): 128 EU/t
- HV (High Voltage): 512 EU/t
- EV (Extreme Voltage): 2,048 EU/t
- IV (Insane Voltage): 8,192 EU/t
- LuV (Ludicrous Voltage): 32,768 EU/t
- ZPM (ZPM Voltage): 131,072 EU/t
- UV (Ultimate Voltage): 524,288 EU/t
- UHV (Ultra High Voltage): 2,097,152 EU/t
- MAX (Maximum Voltage): 2,147,483,648 EU/t

Nomi-CEu keeps GTCEu's high-tier content off, so the UEV, UIV, UXV and OpV tiers are not in the pack.

Recipes are balanced to "VA" values that leave room for cable loss: 7, 30, 120, 480, 1,920, 7,680, 30,720, 122,880, 491,520 and 1,966,080 EU/t for ULV through UHV. A recipe's tier is the lowest tier whose voltage covers its EU/t, so a 30 EU/t recipe is LV and a 120 EU/t recipe is MV.

## Amperage, cables, wires and cable loss (EU lost per block)

Machines only pull the amps they need. A single-block electric machine accepts up to 2A at its tier's voltage. A cable has a maximum voltage, a maximum amperage and a loss per block. Loss is subtracted from each packet's voltage for every block it travels, per amp. Cable sizes are 1x, 2x, 4x, 8x and 16x, which multiply the amperage.

- Insulated cables have the base loss. Uninsulated wires have 2x the loss (1x and 2x wires) or 3x (4x, 8x and 16x wires).
- Uninsulated wires carrying power damage living entities that touch them.
- Superconductor wires have zero loss.

Base values for a 1x cable (max voltage, amps, loss per block):

- Tin: LV, 1A, 1
- Copper: MV, 1A, 2. Annealed Copper and Cupronickel: MV, 1A, 1
- Gold: HV, 3A, 2. Electrum: HV, 2A, 2. Silver: HV, 1A, 1
- Aluminium: EV, 1A, 1. Steel: EV, 2A, 2. Black Steel: EV, 3A, 2
- Platinum: IV, 2A, 1. Tungsten: IV, 2A, 2. Tungstensteel: IV, 3A, 2. Graphene: IV, 1A, 1
- Niobium-Titanium and Osmium: LuV, 4A, 2
- Vanadium-Gallium: ZPM, 4A, 2. Naquadah: ZPM, 2A, 2
- Yttrium Barium Cuprate: UV, 4A, 4. Naquadah Alloy: UV, 2A, 4

Superconductors (zero loss) by tier: Manganese Phosphide (LV), Magnesium Diboride (MV), Mercury Barium Calcium Cuprate (HV), Uranium Triplatinum (EV), Samarium Iron Arsenic Oxide (IV), Indium Tin Barium Titanium Cuprate (LuV), Uranium Rhodium Dinaquadide (ZPM), Enriched Naquadah Trinium Europium Duranide (UV), Ruthenium Trinium Americium Neutronate (UHV).

## Overvoltage, overamperage, burning cables and machine explosions (rain, water, fire)

- Overvoltage: if a machine or hatch receives a packet with a higher voltage than its input voltage, it explodes. Use a transformer to step the voltage down first.
- Cable overvoltage: a cable carrying a higher voltage than its maximum heats up and caps the packet to its own maximum. If it gets hot enough, it burns away (becomes fire). Insulation can melt at high heat, turning a cable back into a bare wire.
- Cable overamperage: when the average amperage through a cable goes above its maximum, it heats up and can burn. Fix this with a thicker cable (2x, 4x, etc.) or a higher amperage material.
- Machines do not explode from too many amps. They only take what they need, up to their amperage limit.
- Weather and terrain explosions: in GTCEu this is a config option (doTerrainExplosion) and it is off by default. When it is on, powered machines can randomly explode or catch fire in rain or thunderstorms, or next to water, fire or lava. Nomifactory CEu keeps this option off, so rain does not blow up machines there.
- Explosions damage terrain by default (doesExplosionDamagesTerrain).
- Steam boilers explode if water is added while they are hot and dry (see the steam boiler section).

## Transformers, energy hatches, dynamo hatches and multiblock power input

Transformers convert between two adjacent voltage tiers. They start in Transform Down mode, and a Soft Mallet switches them to Transform Up.

- Transformer: 1A of the higher tier to 4A of the lower tier (and back).
- Hi-Amp Transformer: 2A to 8A or 4A to 16A.
- Power Transformer: adjustable, up to 16A to 64A.

Energy Input Hatches (energy hatches) feed multiblocks and Dynamo Hatches (energy output hatches) take power out of generators. They come in 2A (normal), 4A and 16A versions for each tier. 64A Substation hatches exist for the Power Substation, and laser hatches (256A and up) move huge amounts of power through Active Transformers.

A multiblock's voltage tier comes from its highest-tier energy hatch. If it has two or more hatches at that highest tier, it counts as one tier higher. For example, one HV hatch makes an HV multiblock, while two HV hatches make it EV, so it can run and overclock EV recipes (one EV hatch does the same). A single 4A or 16A hatch adds amperage but not a tier. The Fusion Reactor does not accept 4A or 16A energy hatches.

## Overclocking: normal overclock (4x energy, 2x speed) and perfect overclock (4x speed)

Machines run lower-tier recipes faster by overclocking (OC). Each normal overclock multiplies EU/t by 4 and halves the duration (2x speed), so every normal overclock uses 2x the total energy. Running several lower-tier machines is more energy efficient than overclocking one high-tier machine. Nomi-CEu keeps GTCEu's default overclock divisor of 2.

- Number of overclocks = the machine's tier minus the recipe's tier. ULV recipes (8 EU/t or less) get one overclock fewer, and LV machines never overclock.
- An overclock is skipped if it would push EU/t above the machine's voltage.
- Duration stops at 1 tick. In GTCEu 2.8.10 (the version in Nomi-CEu) there is no sub-tick overclocking: once a recipe reaches 1 tick, more voltage does nothing, and multiblocks do not turn spare overclocks into parallels. Use more machines or GCYM parallel hatches instead.
- Perfect overclock: EU/t x4 and duration divided by 4 (4x speed), so total energy stays the same. The Large Chemical Reactor always uses perfect overclocks. The Electric Blast Furnace gets perfect overclocks from excess coil heat.
- Fusion Reactors overclock differently: EU/t x2 and duration halved, one overclock per fusion tier above the recipe.

The bot's overclock tool and the %oc command calculate these tables.

## Electric Blast Furnace (EBF) heating coil tiers and temperatures

The Electric Blast Furnace (EBF) smelts high-temperature metals and alloys. Each recipe needs a minimum temperature in Kelvin (K), and the coil blocks set the furnace's base temperature:

- Cupronickel Coil: 1,800 K (LV)
- Kanthal Coil: 2,700 K (MV)
- Nichrome Coil: 3,600 K (HV)
- RTM Alloy Coil: 4,500 K (EV)
- HSS-G Coil: 5,400 K (IV)
- Naquadah Coil: 7,200 K (LuV)
- Trinium Coil: 9,001 K (ZPM)
- Tritanium Coil: 10,800 K (UV)

The EBF gets +100 K for every voltage tier of its energy input above MV. For example, Cupronickel coils on an EV-powered EBF reach 1,800 + 200 = 2,000 K.

Structure: the EBF is 3x3 at the base and 4 blocks tall, with two rings of 8 coil blocks (16 coils) around a hollow middle. The controller goes in the middle of an outer edge of the bottom layer and the Muffler Hatch in the exact centre of the top layer. Every other casing position can hold hatches and buses: a Maintenance Hatch, energy hatches, and item and fluid input and output.

The same coil blocks are used in the Multi Smelter, Pyrolyse Oven and Oil Cracking Unit, where higher coils give more parallels, more speed or lower energy use.

## EBF heat bonus: 5% energy discount every 900K and a perfect overclock every 1800K

Running an EBF hotter than a recipe needs gives two bonuses, both counted from the excess temperature (EBF temperature minus recipe temperature). They only apply to recipes that need at least 900 K:

- For every full 900 K of excess, the recipe's EU/t is multiplied by 0.95 (5% less energy, applied multiplicatively) before overclocking.
- For every full 1,800 K of excess, one overclock becomes a perfect overclock (4x speed instead of 2x for the same 4x EU/t).

Example: Nichrome coils (3,600 K) running an 1,800 K recipe have 1,800 K of excess. That is two 900 K steps, so energy is multiplied by 0.95 x 0.95 (about 0.90), and one overclock is perfect. This is why upgrading coils speeds up older recipes like Aluminium and Stainless Steel.

## EBF recipes, inert gases (Nitrogen, Helium, Argon), hot ingots and the Vacuum Freezer (VF)

Many automatic EBF dust-to-ingot recipes come in two versions: circuit 1 without gas, and circuit 2 with an inert gas that takes about 67% of the time. The gas depends on the material's tier: 1,000 L Nitrogen, 100 L Helium, or 50 L Argon (Neon and Krypton are reserved for addon tiers).

Materials with a blast temperature above 1,750 K come out of the EBF as Hot Ingots. These must be cooled into normal ingots in a Vacuum Freezer (VF), a multiblock that also freezes other substances, like turning Air into Liquid Air. Hot ingots damage players who hold them. For materials at 5,000 K or more, the Vacuum Freezer recipe also uses 500 L of Liquid Helium and returns 250 L of Helium gas.

The default auto-generated EBF recipe uses 120 EU/t (MV), and its duration scales with the material's mass and blast temperature. Specific recipes can override this.

## Multiblocks in general: controller, hatches, buses, Maintenance Hatch and Muffler Hatch

Multiblocks are structures built around a controller. JEI shows each structure and its valid hatch positions, and sneak-right-clicking a controller toggles an in-world preview. Input and Output Buses move items, Input and Output Hatches move fluids, and Energy Hatches bring in power. In GTCEu, every hatch and bus except the Maintenance Hatch can be shared between multiblocks.

Maintenance Hatch: most electric multiblocks need one. Problems build up while the machine runs, and each one is fixed with a tool: Wrench (pipe is loose), Screwdriver (screws are loose), Soft Mallet (something is stuck), Hard Hammer (plating is dented), Wire Cutter (wires burned out), Crowbar (doesn't belong there). Each problem makes recipes take 10% longer, and with all 6 problems the machine stops. Duct Tape in the hatch's tape slot prevents problems. The Automatic Maintenance Hatch never has problems. The Configurable Maintenance Hatch trades faster processing for more frequent problems (or the reverse). The Cleaning Maintenance Hatch also keeps the multiblock clean as if it were in a cleanroom.

Muffler Hatch: needed by polluting multiblocks like the EBF and Pyrolyse Oven. It must have an air block in front of it or the machine stops ("Muffler Hatch is Obstructed"). It can recover small amounts of waste such as ash.

## Parallel processing: Processing Array, Multi Smelter and GCYM Parallel Control Hatches

- Processing Array (PA): holds up to 16 single-block machines of the same type in its Machine Access Interface and runs them as one multiblock. The Advanced Processing Array holds up to 64.
- Multi Smelter: smelts 32 items at once times the coil level: Cupronickel 32, Kanthal 64, Nichrome 64, RTM Alloy 128, HSS-G 128, Naquadah 256, Trinium 256, Tritanium 512. Higher coils also cut the energy used per item.
- Steam Grinder and Steam Oven: steam multiblocks with up to 8 parallels.
- GCYM (Gregicality Multiblocks): an addon used by Nomifactory CEu that adds large multiblock versions of most machines. Examples: Alloy Blast Smelter, Rotary Hearth Furnace (mega EBF), Bulk Blast Chiller (mega Vacuum Freezer), Large Fractionating Distillery, Large Maceration Tower, Large Centrifuge Unit, Large Electrolysis Plant, Large Chemical Bath, Large Mixing Vessel, Large Assembling Factory, Large Circuit Assembler and Chemical Plant. Parallel Control Hatches let them run several recipes at once: IV (Elite) 4, LuV (Master) 16, ZPM (Ultimate) 64, UV (Super) 256 parallels.

## Steam age: steam boilers, bronze (low pressure) vs high pressure steel steam machines

The Steam Age runs on Steam instead of EU. Fluids are measured in liters (L), where 1 L = 1 mB.

Small boilers produce steam from fuel and water, heating up over time and pushing steam out of every side except the bottom. Maximum output in L of steam per tick:

- Solid Fuel (coal) boiler: bronze 6 L/t, high pressure steel 15 L/t
- Liquid (lava) boiler: bronze 12 L/t, steel 30 L/t
- Solar boiler: bronze 6 L/t, steel 18 L/t (only in sunlight)

Boiler explosion: if a hot boiler runs out of water and water is then added, it explodes. Keep water supplied continuously, ideally automatically.

Steam machines (macerator, compressor, extractor, forge hammer, alloy smelter, furnace and others) can run recipes up to 32 EU/t (ULV and LV recipes). Single-block steam machines use 1 L of steam per EU.

- Bronze (low pressure) machines run recipes at the listed EU/t but take twice as long.
- High pressure (steel) machines run at normal speed but use twice the steam per tick.

Steam machines vent steam out of one side after each recipe. The vent must not be blocked, or the machine stops. Use a Wrench to change the venting side. Venting steam hurts entities standing in front of it.

## Steam multiblocks, Coke Oven, Primitive Blast Furnace (PBF) and Primitive Water Pump

- Coke Oven: a brick multiblock that turns Coal into Coal Coke and Logs into Charcoal, and collects Creosote Oil in a 32-bucket internal tank. It needs no fuel. Coke Oven Hatches let you automate it.
- Primitive Blast Furnace (PBF): built from Firebricks. It turns Iron or Wrought Iron into Steel using Coal, Charcoal or Coke before you have an EBF.
- Primitive Water Pump: collects water every second, with the amount depending on biome and the output hatch used (pump, ULV or LV hatch).
- Steam Grinder (a multiblock macerator) and Steam Oven (a multiblock smelter): steam-powered multiblocks with up to 8 parallels. They only accept Steam Hatches and steam buses. Steam multiblocks use 2 L of steam per EU by default.
- Large Boilers (Bronze, Steel, Titanium, Tungstensteel): burn solid or liquid fuel to make large amounts of steam, and can be throttled to save fuel. A Large Boiler explodes if given fuel with no water.
- Multiblocks in general, including primitive ones, can share wall blocks with each other.

## Ore processing chain: macerator, ore washer, thermal centrifuge, crushed and purified ore

GregTech ores give much more output when processed in steps instead of smelted directly:

- Ore to Crushed Ore: a Macerator gives 2 Crushed Ore plus a chance of a byproduct. A Forge Hammer gives only 1. Smelting raw ore usually gives 1 ingot, and ores that need an EBF cannot be smelted in a furnace.
- Crushed Ore to Purified Crushed Ore: Ore Washer. With 1,000 L Water (circuit 1) or 100 L Distilled Water it also gives a byproduct dust (33% chance) and Stone Dust. With 100 L Water on circuit 2 it is fast but gives no byproducts.
- Crushed Ore to Purified Ore in a Chemical Bath: some ores can be washed in Mercury or Sodium Persulfate for a different byproduct.
- Purified Ore to Refined (centrifuged) Ore: Thermal Centrifuge, with a 33% chance of a second byproduct.
- Any stage to dust: Macerator (with a chance of a byproduct) or Forge Hammer. Macerating crushed ore gives Impure Dust, purified ore gives Purified Dust, and refined ore gives normal Dust.
- Impure and Purified Dust become clean dust in a Centrifuge (with an 11% byproduct chance) or quickly in an Ore Washer.

Chanced outputs in GTCEu have a base chance plus a boost for every voltage tier of the machine above the recipe's tier. Higher-tier macerators get more byproducts.

## Ore byproducts, Sifter for gems, Electromagnetic Separator and Electrolyzer

Each ore material has a list of byproducts, and different steps give different ones:

- Macerating raw ore, Ore Washer and Impure Dust centrifuging: first byproduct.
- Thermal Centrifuge and Purified Dust centrifuging: second byproduct.
- Macerating refined (centrifuged) ore: third byproduct.
- Chemical Bath washing (Mercury, Sodium Persulfate): its own byproduct.
- JEI shows each ore's byproducts on the ore's processing page.

Gem ores (Diamond, Ruby, Emerald, Sapphire and others): put Purified Crushed Ore in a Sifter to get gems by chance, including Exquisite, Flawless, normal, Flawed and Chipped gems plus dust.

Magnetic ores: the Electromagnetic Separator splits Purified Dust of some materials into the main dust plus chanced metal byproducts.

Electrolyzer and Centrifuge: break compound dusts and fluids into their elements or parts. For example, electrolyzing Water gives Hydrogen and Oxygen. JEI lists what each compound breaks down into.

## Chemistry basics: Chemical Reactor, Large Chemical Reactor (LCR) and fluid units (L, mB, buckets)

Fluid amounts in GTCEu are shown in liters (L). 1 L = 1 mB (millibucket), and 1,000 L = 1,000 mB = 1 bucket. One ingot or dust of a molten material equals 144 L (so 1 nugget is 16 L and 1 block is 1,296 L).

- Chemical Reactor: the single-block machine for most chemical reactions. It has up to 2 item inputs, 3 fluid inputs, 2 item outputs and 2 fluid outputs.
- Large Chemical Reactor (LCR): a multiblock that runs Chemical Reactor recipes plus large-only recipes with more slots (up to 3 item and 5 fluid inputs, 3 item and 4 fluid outputs). It always uses perfect overclocks (4x speed for 4x EU/t, so 100% energy efficiency). Its structure needs exactly 1 Cupronickel Coil Block next to the central PTFE Pipe Casing.
- Programmed Circuit (integrated circuit): a non-consumed item set to a number from the circuit GUI. Many recipes use it to choose between outputs that share the same inputs. Shift-right-clicking a machine with one sets the machine's circuit slot.
- Electrolyzer, Centrifuge, Mixer, Chemical Bath, Fluid Extractor, Fluid Solidifier, Distillery and Distillation Tower are the other main chemistry machines.

## Distillation Tower (DT) vs Distillery for oil, biomass and liquid air

Distillation Tower (DT): a multiblock that splits one fluid into all of its fractions at once. It is 3x3 and from 2 to 13 blocks tall. Each layer above the first must have exactly one Output Hatch, which gives one fluid output, so a recipe with N fluid outputs needs a tower of N + 1 layers (up to 12 outputs). The bottom layer takes the fluid input and can output items. Oil (four outputs) needs a five-block-high tower. DTs break down Oil, Fermented Biomass, Wood Tar, Liquid Air and cracked fuels.

Distillery: a single-block machine that makes only one of a DT recipe's outputs, chosen with a Programmed Circuit (circuit 1 for the first output, 2 for the second and so on). Distillery versions of DT recipes are generated automatically with 1/4 of the EU/t and twice the duration.

Distilleries can be more power efficient for producing a single fluid, but a DT gives every byproduct at once. Oil Cracking Units crack Light and Heavy Fuel with Hydrogen or Steam before further distillation.

## Circuits and circuit tiers (Electronic, Integrated, Microprocessor, Nano, Quantum, Crystal, Wetware)

Circuits are grouped by voltage tier, and recipes ask for "any circuit of tier X". Each line has a processor, assembly, computer and mainframe:

- ULV: Vacuum Tube, NAND Chip
- LV: Electronic Circuit, Integrated Logic Circuit, Microprocessor
- MV: Good Electronic Circuit, Good Integrated Circuit, Integrated Processor
- HV: Advanced Integrated Circuit, Processor Assembly, Nanoprocessor
- EV: Workstation, Nanoprocessor Assembly, Quantumprocessor
- IV: Mainframe, Nano Supercomputer, Quantumprocessor Assembly, Crystal Processor
- LuV: Nanoprocessor Mainframe, Quantum Supercomputer, Crystal Processor Assembly, Wetware Processor
- ZPM: Quantumprocessor Mainframe, Crystal Supercomputer, Wetware Assembly
- UV: Crystal Processor Mainframe, Wetware Supercomputer
- UHV: Wetware Mainframe

Most circuit recipes from Integrated circuits onward use the Circuit Assembler, and newer circuit parts need a Cleanroom. Lines unlock in order: Electronic, Integrated, Microprocessor (Integrated Processor line), Nano, Quantum, Crystal, Wetware. Within a line, a higher circuit is made from several of the one below it. A newer line makes the same tier more cheaply. Nomifactory CEu quests call LV circuits "Tier One", MV "Tier Two" and so on.

## Material components: dust, ingot, plate, rod, bolt, screw, gear and their material amounts

GregTech parts are auto-generated from materials. Amounts are in units of one ingot or one dust:

- Ingot, Dust, Gem, Plate, Long Rod, Small Gear, Spring, Impure and Purified Dust: 1
- Small Dust, Ring, Foil, Small Spring, Chipped Gem: 1/4
- Tiny Dust, Nugget, Screw, Round: 1/9
- Rod (stick), Flawed Gem: 1/2
- Bolt, Fine Wire: 1/8
- Lens: 3/4
- Double Plate, Frame Box, Flawless Gem: 2
- Gear, Rotor, Exquisite Gem: 4
- Block, Dense Plate: 9
- Turbine Blade: 10
- Wires and cables: 1x is 1/2, 2x is 1, 4x is 2, 8x is 4, 16x is 8
- Fluid pipes: Tiny 1/2, Small 1, Normal 3, Large 6, Huge 12

Molten material: 144 L per ingot. Machines like the Macerator and Arc Furnace recycle parts back into dust or ingots in these proportions. Bending Machines make plates, Lathes make rods and screws, Wiremills make wires, and Extruders shape ingots with extruder molds.

## Common GregTech abbreviations and terms (EBF, LCR, PBF, DT, VF, EU, mB, OC, PA)

- EU: Energy Unit. EU/t is EU per tick (20 ticks = 1 second).
- A, amp: amperage, the number of energy packets per tick.
- L, mB: liters and millibuckets, the same unit. 1,000 L is 1 bucket.
- OC: overclock. Perfect OC: 4x speed per overclock.
- ULV, LV, MV, HV, EV, IV, LuV, ZPM, UV, UHV: voltage tiers.
- GT, GTCE, GTCEu, CEu: GregTech, GregTech Community Edition, GregTech Community Edition Unofficial.
- EBF: Electric Blast Furnace
- PBF: Primitive Blast Furnace
- LCR: Large Chemical Reactor
- DT: Distillation Tower
- VF: Vacuum Freezer
- PA: Processing Array
- LCE / ECE: Large / Extreme Combustion Engine
- PSS: Power Substation
- HPCA: High Performance Computing Array
- AL: Assembly Line
- ABS: Alloy Blast Smelter (GCYM)
- GCYM: Gregicality Multiblocks addon
- JEI: Just Enough Items, used to look up recipes (R) and uses (U)
- Nomi-CEu: Nomifactory CEu modpack. DME: Deep Mob Evolution. AE2: Applied Energistics 2.

## Fusion Reactor Mk1, Mk2, Mk3 (LuV, ZPM, UV), EU to start and heat

Fusion Reactors are large ring multiblocks that fuse fluids into heavier elements and plasmas. There are three tiers: Mark 1 (LuV), Mark 2 (ZPM) and Mark 3 (UV). Each has 16 Energy Hatch positions. Each hatch adds to the reactor's energy buffer: 10M EU per hatch on Mk1 (160M EU with all 16), 20M per hatch on Mk2 (320M) and 40M per hatch on Mk3 (640M). The 4A and 16A Energy Hatches cannot be used.

Every fusion recipe has an "EU to Start" value. This is drained from the buffer as heat before the recipe begins, so a recipe needs a reactor with a big enough buffer, which sets the minimum reactor tier. Heat stays while the reactor keeps running, even across different recipes. Switching to a hotter recipe only costs the difference. Heat drains quickly when the reactor stops or is paused.

Fusion overclocking is special: each overclock doubles EU/t and halves the duration, and a reactor gets one overclock per fusion tier above the recipe's tier. Plasmas from fusion can fuel the Large Plasma Turbine.

## Other high-tier multiblocks: Assembly Line, Cleanroom, research, Power Substation, Active Transformer

- Cleanroom: a hollow multiblock from 5x5x5 to 15x15x15. Filter Casings fill the ceiling (excluding the edges) with the controller in the centre of the top. Walls are Plascrete or Cleanroom Glass. It uses 30 EU/t while dirty and 4 EU/t when clean, and needs a Maintenance Hatch and energy. Machines inside can run cleanroom recipes once it is fully clean. Power goes in through Hulls or Diodes in the walls, and items and fluids through Passthrough Hatches. Generators, Muffler Hatches and primitive machines are not allowed inside. It accepts up to 4 doors.
- Assembly Line (AL): 5 to 16 slices, used for advanced components. Its recipes need research data from a Scanner or, for harder research, the Research Station. The Research Station runs on computation (CWU/t) supplied by HPCAs. Data Banks share research data between Assembly Lines. Some setups require the item and fluid inputs to be in order.
- Power Substation (PSS): stores huge amounts of energy in up to 18 layers of capacitor blocks, with a small passive loss.
- Active Transformer: turns any number and tier of energy hatches into dynamo hatches. With Laser Source and Target Hatches, it sends power in a straight line with no loss.
- Implosion Compressor: uses explosives to turn gem dusts into gems.
- Large Combustion Engine (EV) and Extreme Combustion Engine (IV): need Lubricant. Oxygen (or Liquid Oxygen for the Extreme engine) boosts output at 2x fuel use.

## Power generation: steam turbine, combustion generator, gas turbine, large turbines, solar panels

Single-block generators exist in LV, MV and HV. Fuel values in Nomi-CEu (GTCEu 2.8.10, EU per liter of fuel):

- Steam Turbine: 2 L of Steam per EU (640 L of Steam gives 320 EU).
- Combustion Generator: High Octane Gasoline 3,200, Gasoline 1,600, Cetane-Boosted Diesel 720, Diesel 480, Naphtha 320, Light Fuel 320, Bio Diesel 256, Rocket Fuel 250, Ethanol 192, Methanol 64.
- Gas Turbine: Benzene 352, Refinery Gas 160, Ethylene 128, Methane 112, Coal Gas 96, Wood Gas 24, Natural Gas 20.

All of these generate 32 EU/t per recipe step in the LV generator; higher-tier generators run the same fuel faster.

Multiblock generators:

- Large Steam Turbine (HV), Large Gas Turbine (EV), Large Plasma Turbine (IV). They need a rotor in a Rotor Holder, and output depends on rotor material, efficiency and turbine speed. Rotor Holders of a higher tier than the turbine add efficiency.
- Large Combustion Engine (EV) and Extreme Combustion Engine (IV): need Lubricant, and Oxygen (or Liquid Oxygen for the Extreme engine) boosts output at 2x fuel use.
- Large Boilers paired with steam turbines.

Solar Panel covers (ULV and up) go on the top face of a block that stores EU and only work with a clear view of the sun. Other common Nomi-CEu power sources are Solar Flux Reborn RF panels, Thermal dynamos with Energy Converters, NuclearCraft reactors, Draconic Evolution and the Naquadah Reactors.

## Nomifactory CEu (Nomi-CEu) overview and Normal vs Expert mode differences

Nomifactory CEu (Nomi-CEu) is a Minecraft 1.12.2 fork of Nomifactory that replaces GregTech CE with GregTech CEu and its related mods. It uses GCYM multiblocks (up to 256 parallels), Assembly Line research, the Cleanroom, reworked circuits and a questbook with a Processing Lines tab. Nether Portals are disabled, and the quest book unlocks Nether access with Nether Cakes. Nomicoins from quests and bounties buy materials. Deep Mob Evolution (DME) mob simulation gives renewable resources. Normal mode skips the GregTech Steam Age and starts on RF power: Thermal Steam Dynamos feed LV Energy Converters, which turn RF into EU. The pack converts at 4 RF = 1 EU in both directions. Machines explode from overvoltage, but never from rain or nearby water, fire or lava (terrain explosions are off). Pipes and cables use GT6-style connections: they only connect to the side you place them against, and a wrench or wire cutter adds or removes sides.

Expert mode is a harder pack mode based on Omnifactory Self-Torture Edition. You switch to it with the pack-mode-switcher script, and a server and its clients must use the same mode. Expert mode:

- forces Peaceful difficulty
- removes DME as an easy infinite source
- disables Nomicoins
- includes the Steam Age
- focuses more on GregTech power generation
- replaces the Creative Tank with Stabilized Micro Miners
- makes some recipes harder (Iridium, Graphene, Numismatic Dynamos)

Its GregTech config also turns on the harder recipe options (circuits, EBF controller, glass, wood, paper, charcoal, bricks, redstone, tools and armor), requires Assembly Line item inputs in order (normal mode does not), makes 1 multiblock casing per craft instead of 2, and halves ore generation: at least 2 veins per section plus up to 2 more, instead of 4 and 4 in normal mode. Expert-only multiblocks include the Universal Crystallizer and the Actualization Chamber.

## Nomi-CEu Micro Miners and Microverse Projectors (small, medium, large)

Micro Miners are a Nomifactory CEu mechanic for getting large amounts of ores and rare items. A Micro Miner is put into a Microverse Projector (a GregTech multiblock) with fuel such as Rocket Fuel, and the projector sends it on a mission that returns stacks of ores, gems and items. Some items, like Radium Salt and Naquadah Dust, are otherwise unobtainable. Normal Micro Miners are single use. Missions are listed under the projector in JEI (press U on the controller).

- Small Microverse Projector: the first projector, for the early-tier miners. A single HV Energy Hatch handles missions up to 1,024 EU/t. Higher missions need at least EV power (two HV hatches or one EV hatch). Missions overclock like normal recipes.
- Medium Microverse Projector: Tier Four through Tier Six Micro Miners, starting at IV power, with later missions needing LuV.
- Large Microverse Projector: Tier Seven through Tier Ten Micro Miners, starting at LuV power.

Microversium (needed for projectors) is smelted with Deuterium. Buses and hatches can go in place of any Microverse Projector Casing. Some missions need an EV or better Output Bus.

## Nomi-CEu Stabilized Micro Miners, Actualization Chamber, Creative Tank and Naquadah Reactor

- Creative Tank (Normal mode): a major milestone. The Creative Tank Provider multiblock makes Creative Tanks, which can be set to a fluid and give an infinite supply. The GT Creative Tank can be turned on and off and configured for amount, rate and direction.
- Stabilized Micro Miners (Expert mode): made by injecting Micro Miners with a Heart of a Universe, which makes them reusable. They run in the matching Microverse Projector without catalysts and return Pristine Microverse Matter. The Actualization Chamber exchanges that matter for loot. Running several chambers lets you round-robin the matter, since their integrated circuits can't be taken out.
- Universal Crystallizer (Expert mode): makes Crystal Matrix Ingots for about a ninth of the Diamond cost, and makes Draconic cores, Awakened Draconium and Empowered blocks faster than Fusion Crafting. It can run on laser power.
- Naquadah Reactor Mk1 and Mk2: Nomi-CEu generator multiblocks that make large amounts of EU from Enriched Naquadah or Naquadria decaying into Lead. Naquadria gives 4x the power of Enriched Naquadah. Mk2 makes much more power but costs a lot of Omnium.
- The final goal of both modes is the Creative Chest.
