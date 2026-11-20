(function () {
  'use strict';

  // Model-space rectangles inside the scene mattes. Both viewers use the
  // original animation and draw order inside these apertures.
  const authoredFrames = new Map([
    ['20110_skin_Arpeggio07.json', { minX: -3618, minY: -2048, maxX: 3614, maxY: 2042 }], // bg / box2
    ['30180_skin_Machairodus05c.json', { minX: -5290, minY: -300, maxX: 3158, maxY: 4480 }], // PG_tong1_1a / PG_tong1_2a
    ['30300_skin_Bluebuck03c.json', { minX: -2890, minY: -1740, maxX: 2740, maxY: 1690 }], // background_108
    ['40230_skin_Scorching03b.json', { minX: -1930, minY: -1250, maxX: 1980, maxY: 1070 }], // tx_heiping2
    ['20030_skin_Pyrock03b.json', { minX: -2470, minY: -1740, maxX: 2860, maxY: 1430 }], // AAAkuang
  ]);
  const tyrfingSceneShots = [
    'click5', 'click6', 'click7', 'click8_1', 'click8_2', 'click8_Switch',
    'click9_1', 'click9_2', 'click10', 'click11', 'click12_Tip', 'idle2', 'tip',
  ];

  // These actions move artwork or a transition across the interaction camera.
  // Preserve the camera composition instead of fitting the union of that motion.
  const actionFrames = new Map([
    ['60310_skin_Tizona04b.json', {
      actions: ['click6', 'idle2', 'idle3', 'click7_1', 'click7_2', 'click8', 'click9', 'click10', 'click12'],
      frame: { minX: -1350, minY: -1050, maxX: 1130, maxY: 850 },
    }],
    ['78020_skin_CurtanaSP03b.json', {
      actions: ['click6'], // The scope opens over the normal room camera.
      frame: { minX: -3390, minY: -1460, maxX: 3240, maxY: 2610 },
      shots: new Map([['click5_1', { minX: -3284, minY: -1433, maxX: 3139, maxY: 2546 }]]),
    }],
    ['60020_skin_Joyeuse05.json', {
      actions: ['click7'], // Allow the phone bezel to travel across the enlarged car art.
      frame: { minX: -2860, minY: -1710, maxX: 3020, maxY: 1720 },
    }],
    ['70430_skin_Harvest03b.json', {
      actions: ['click7'], // Include the phone at rest and preserve its exit during the close-up.
      frame: { minX: -9550, minY: -8720, maxX: 9550, maxY: 3775 },
    }],
    ['30180_skin_Machairodus05a.json', {
      actions: ['guochang1_1', 'guochang1_2'], // Outer fade geometry extends beyond bj_houjing23.
      frame: { minX: -5000, minY: 134, maxX: 2785, maxY: 4065 },
      shots: new Map([
        ['click3', { minX: -5636, minY: -835, maxX: 3606, maxY: 5230 }],
        ...['click4_a', 'click4_b', 'click4_c', 'click5', 'click55'].map(name =>
          [name, { minX: -5774, minY: -227, maxX: 4736, maxY: 4097 }]),
      ]),
    }],
    ['60320_skin_dainslef03.json', {
      actions: ['click2', 'click3'], // Letterbox and close-up over the original room view.
      frame: { minX: -3300, minY: -2080, maxX: 3220, maxY: 2320 },
    }],
    ['60350_skin_Ijen03.json', {
      actions: ['click7', 'click7_b', 'click9'],
      frame: { minX: -2470, minY: -440, maxX: 2800, maxY: 3040 },
    }],
    ['20080_skin_Melody06.json', {
      actions: ['click10b', 'guochang'],
      frame: { minX: -3340, minY: -1980, maxX: 3210, maxY: 2470 },
    }],
    ['CG0085_TwinStarAttendantsB.json', {
      actions: ['click3', 'click4', 'click5', 'click6', 'guochang'],
      frame: { minX: -4740, minY: -2040, maxX: 4580, maxY: 4240 },
    }],
    ['10070_skin_Cinnabar03c.json', {
      actions: ['click11_2'],
      frame: { minX: -4500, minY: -2510, maxX: 4500, maxY: 3220 }, // Inside the top of heiping.
    }],
    ['50030_skin_Stinger03.json', {
      actions: ['in'], // The curtain opens while the room camera pulls back.
      frame: { minX: -3330, minY: -2060, maxX: 3560, maxY: 2590 },
    }],
    ['60300_skin_Moralltach03.json', {
      actions: ['guochang1', 'guochang2', 'guochang3'],
      frame: { minX: -3750, minY: -2240, maxX: 3750, maxY: 2600 },
    }],
    // Model-space equivalents of the corresponding interaction viewports.
    ['70090_skin_Ares05.json', {
      actions: ['click2_1'],
      frame: { minX: -2740, minY: -1650, maxX: 2640, maxY: 1880 },
    }],
    ['75010_skin_VodkaMirror03.json', {
      actions: ['click7_b', 'click8', 'guochang1', 'guochang2', 'guochang3'],
      frame: { minX: -3460, minY: -2075, maxX: 3370, maxY: 2410 },
    }],
    ['70400_skin_LycorisRadiata03a.json', {
      actions: ['guochang'],
      frame: { minX: -5150, minY: -800, maxX: 4515, maxY: 5540 },
    }],
    ['CG0056_MasterofTides.json', {
      actions: ['in'],
      frame: { minX: -2740, minY: -2000, maxX: 2660, maxY: 1545 },
    }],
    ['CG0077_ChangingInPrivate_b.json', {
      actions: ['click3'],
      frame: { minX: -3605, minY: -2135, maxX: 3765, maxY: 2700 },
    }],
    ['20070_skin_Anthem06.json', {
      actions: ['in'],
      frame: { minX: -3680, minY: -2140, maxX: 3710, maxY: 2715 },
      shots: new Map([['click4', { minX: -2773, minY: -1907, maxX: 2891, maxY: 2133 }]]),
    }],
    ['50250_skin_CCC04.json', {
      actions: ['click4'],
      frame: { minX: -3600, minY: -250, maxX: 3885, maxY: 4660 },
    }],
    ['60160_skin_Aymur05.json', {
      actions: ['in'],
      frame: { minX: -3720, minY: -2250, maxX: 3720, maxY: 2630 },
    }],
    ['70260_skin_Thor04.json', {
      actions: ['click3'],
      frame: { minX: -3775, minY: -2310, maxX: 3775, maxY: 2640 },
    }],
    ['78010_skin_Lobera03b.json', {
      actions: ['click6'],
      frame: { minX: -2190, minY: -340, maxX: 2185, maxY: 2530 },
    }],
    ['60210_skin_Longxian03a.json', {
      actions: ['click1'],
      frame: { minX: -3740, minY: -2250, maxX: 3710, maxY: 2635 },
    }],
    ['60321_skin_dainslef03.json', {
      actions: ['click4'],
      frame: { minX: -3360, minY: -2085, maxX: 3530, maxY: 2440 },
    }],
    ['70240_skin_Skadi05.json', {
      actions: ['click4'],
      frame: { minX: -3755, minY: -2280, maxX: 3755, maxY: 2650 },
    }],
    ['70240_skin_Skadi06.json', {
      actions: ['click4', 'click8'],
      frame: { minX: -3675, minY: -1970, maxX: 3710, maxY: 2880 },
    }],
    ['70420_skin_Smelt03.json', {
      actions: ['in'],
      frame: { minX: -3725, minY: -2130, maxX: 3695, maxY: 2740 },
    }],
    // Keep the established stage camera when the rig performs its own zoom.
    ['30500_skin_KunlunSP06.json', {
      actions: ['click3_2'],
      frame: { minX: -3098, minY: -2534, maxX: 3741, maxY: 2646 },
    }],
    ['70050_skin_Hades03.json', {
      actions: ['in'],
      frame: { minX: -1661, minY: -1453, maxX: 2095, maxY: 1656 },
    }],
    ['70410_skin_BuzzingBlade03.json', {
      actions: ['click3'],
      frame: { minX: -2147, minY: -2049, maxX: 2595, maxY: 2039 },
    }],
    ['70410_skin_BuzzingBlade04.json', {
      actions: ['click2'],
      frame: { minX: -3319, minY: -2050, maxX: 3246, maxY: 2050 },
    }],
    ['CG04_SummerRendezvous.json', {
      actions: ['in'], // Keep the original camera overlay inside the normal stage view.
      frame: { minX: -2890, minY: -567, maxX: 1997, maxY: 1542 },
    }],
    ['70310_skin_Atum03a.json', {
      actions: ['click7'],
      frame: { minX: -2584, minY: -2048, maxX: 1981, maxY: 2050 },
    }],
    ['70400_skin_LycorisRadiata04.json', {
      actions: ['click5', 'in'],
      frame: { minX: -1577, minY: -1019, maxX: 1585, maxY: 1018 },
    }],
    ['30180_skin03_Machairodus.json', {
      actions: ['in'],
      frame: { minX: -1020, minY: 32, maxX: 955, maxY: 1984 },
    }],
    ['30400_skin_Badlands05a.json', {
      actions: ['click4'],
      frame: { minX: -2689, minY: -2074, maxX: 2479, maxY: 1807 },
    }],
    ['50080_skin_Sandfly04.json', {
      actions: ['click4'],
      frame: { minX: -1914, minY: -2109, maxX: 2053, maxY: 1822 },
    }],
    ['60110_skin_Burtgang04.json', {
      actions: ['click1'],
      frame: { minX: -2031, minY: -2271, maxX: 1825, maxY: 1786 },
    }],
    ['60150_skin_Tyrfing04.json', {
      actions: ['in'],
      frame: { minX: -2046, minY: -319, maxX: 2525, maxY: 3686 },
    }],
    ['60150_skin_Tyrfing05.json', {
      actions: tyrfingSceneShots,
      frame: { minX: -2681, minY: -2177, maxX: 2684, maxY: 2014 },
    }],
    ['60160_skin_Aymur04.json', {
      actions: ['in'],
      frame: { minX: -2131, minY: -2122, maxX: 1923, maxY: 2139 },
    }],
    ['70430_skin_Harvest03a.json', {
      actions: ['click2'],
      frame: { minX: -3232, minY: -2059, maxX: 3235, maxY: 2051 },
    }],
  ]);

  // In these actions the animated rig moves inside the established stage camera.
  // Fitting the entire rig would count offscreen geometry from the transition.
  const stageCameraFrames = new Map([
    ['10010_skin_Alps03.json', { actions: ['in'],
      frame: { minX: -1010, minY: -289, maxX: 1309, maxY: 2065 } }],
    ['10010_skin_Alps04.json', { actions: ['click3', 'in'],
      frame: { minX: -2924, minY: -66, maxX: 2794, maxY: 4049 } }],
    ['10010_skin_Alps05.json', { actions: ['in'],
      frame: { minX: -1976, minY: -2048, maxX: 1964, maxY: 2066 } }],
    ['10010_skin_Alps06.json', { actions: ['in'],
      frame: { minX: -2689, minY: -2453, maxX: 1850, maxY: 2063 } }],
    ['10030_skin_Wolframite04.json', { actions: ['in'],
      frame: { minX: -2257, minY: -2308, maxX: 2313, maxY: 2307 } }],
    ['10070_skin_Cinnabar03b.json', { actions: ['in'],
      frame: { minX: -2737, minY: -1929, maxX: 2766, maxY: 1861 } }],
    ['10070_skin_Cinnabar03c.json', { actions: ['click6'],
      frame: { minX: -3796, minY: -2352, maxX: 3802, maxY: 2809 } }],
    ['10220_skin_Garnet03b.json', { actions: ['in'],
      frame: { minX: -2216, minY: -2054, maxX: 2206, maxY: 2055 } }],
    ['10240_skin_Pyroxene04.json', { actions: ['in'],
      frame: { minX: -2907, minY: -1974, maxX: 2893, maxY: 2150 } }],
    ['20070_skin_Anthem03.json', { actions: ['in'],
      frame: { minX: -1029, minY: -532, maxX: 1080, maxY: 1558 } }],
    ['20070_skin_Anthem06.json', { actions: ['click3'],
      frame: { minX: -2773, minY: -1907, maxX: 2891, maxY: 2133 } }],
    ['20080_skin_Melody04.json', { actions: ['in'],
      frame: { minX: -2071, minY: -2039, maxX: 1994, maxY: 2324 } }],
    ['20110_skin_Arpeggio06.json', { actions: ['in'],
      frame: { minX: -1967, minY: -2425, maxX: 1964, maxY: 1510 } }],
    ['20140_skin_Capriccio04a.json', { actions: ['click5', 'click6'],
      frame: { minX: -2872, minY: -2224, maxX: 2690, maxY: 2077 } }],
    ['20230_skin_STRUM05.json', { actions: ['in'],
      frame: { minX: -2978, minY: -2057, maxX: 2883, maxY: 2044 } }],
    ['20230_skin_STRUM07.json', { actions: ['in'],
      frame: { minX: -4996, minY: -4587, maxX: 5595, maxY: 4619 } }],
    ['20240_skin_Uillean05.json', { actions: ['in'],
      frame: { minX: -2059, minY: -1870, maxX: 1963, maxY: 2245 } }],
    ['30050_skin_Acheron04.json', { actions: ['in'],
      frame: { minX: -4251, minY: -2447, maxX: 4017, maxY: 2091 } }],
    ['3006_skin_CrestedPlume03.json', { actions: ['click4_2'],
      frame: { minX: -3236, minY: -1866, maxX: 3216, maxY: 2172 } }],
    ['3006_skin_CrestedPlume03_ASMR.json', { actions: ['camera'],
      frame: { minX: -3236, minY: -1866, maxX: 3216, maxY: 2172 } }],
    ['30180_skin_Machairodus05a.json', { actions: ['in'],
      frame: { minX: -5774, minY: -227, maxX: 4736, maxY: 4097 } }],
    ['30220_skin_Rex04.json', { actions: ['in'],
      frame: { minX: -2896, minY: -1740, maxX: 2852, maxY: 1941 } }],
    ['30250_skin_Stegosaurus03.json', { actions: ['click5'],
      frame: { minX: -2627, minY: -801, maxX: 2654, maxY: 3150 } }],
    ['30260_skin_Tyrant03.json', { actions: ['in'],
      frame: { minX: -2027, minY: -139, maxX: 2420, maxY: 3900 } }],
    ['30270_skin_Ankylosaurus03.json', { actions: ['click4'],
      frame: { minX: -2601, minY: -1459, maxX: 2545, maxY: 2748 } }],
    ['30300_skin_Bluebuck03b.json', { actions: ['in'],
      frame: { minX: -3060, minY: -2289, maxX: 3139, maxY: 2087 } }],
    ['30400_skin_Badlands05a.json', { actions: ['click2'],
      frame: { minX: -2689, minY: -2074, maxX: 2479, maxY: 1807 } }],
    ['30431_skin_Lepus03.json', { actions: ['in'],
      frame: { minX: -2461, minY: -1862, maxX: 2241, maxY: 2064 } }],
    ['30450_skin_Leedsichthys03_ASMR.json', { actions: ['camera'],
      frame: { minX: -2013, minY: -1135, maxX: 1918, maxY: 1182 } }],
    ['30480_skin_Ushuaia03.json', { actions: ['in'],
      frame: { minX: -1146, minY: -1014, maxX: 1155, maxY: 1016 } }],
    ['30480_skin_Ushuaia04.json', { actions: ['in'],
      frame: { minX: -2044, minY: -1657, maxX: 2084, maxY: 1572 } }],
    ['30481_skin_Ushuaia04.json', { actions: ['click4'],
      frame: { minX: -2103, minY: -555, maxX: 2295, maxY: 2776 } }],
    ['30481_Ushuaia03.json', { actions: ['in'],
      frame: { minX: -1023, minY: -998, maxX: 1002, maxY: 1005 } }],
    ['30490_skin_MareeRouge05.json', { actions: ['in'],
      frame: { minX: -2739, minY: -461, maxX: 3784, maxY: 3555 } }],
    ['30490_skin_MareeRouge05_ASMR.json', { actions: ['camera'],
      frame: { minX: -2739, minY: -461, maxX: 3784, maxY: 3555 } }],
    ['30500_skin_Kunlun03.json', { actions: ['click7'],
      frame: { minX: -2409, minY: -1962, maxX: 2430, maxY: 2045 } }],
    ['40020_skin_Trade03.json', { actions: ['in'],
      frame: { minX: -2452, minY: -1968, maxX: 2224, maxY: 2070 } }],
    ['40020_skin_Trade04.json', { actions: ['in'],
      frame: { minX: -2424, minY: -1970, maxX: 2396, maxY: 1759 } }],
    ['40040_skin_Prominence03.json', { actions: ['in'],
      frame: { minX: -2153, minY: -2036, maxX: 2209, maxY: 1999 } }],
    ['40150_skin_Rainbow03.json', { actions: ['in'],
      frame: { minX: -2478, minY: -2054, maxX: 2477, maxY: 2057 } }],
    ['40230_skin_Scorching03a.json', { actions: ['click5'],
      frame: { minX: -2015, minY: -1454, maxX: 2030, maxY: 1458 } }],
    ['40400_skin_Collapsar03.json', { actions: ['in'],
      frame: { minX: -2333, minY: -2639, maxX: 2516, maxY: 2230 } }],
    ['50010_skin_Queenbee03.json', { actions: ['in'],
      frame: { minX: -2449, minY: -2016, maxX: 2829, maxY: 2073 } }],
    ['50011_skin_Queenbee03.json', { actions: ['in'],
      frame: { minX: -2451, minY: -2050, maxX: 2696, maxY: 2043 } }],
    ['50030_skin_Stinger03.json', { actions: ['click3'],
      frame: { minX: -2360, minY: -1908, maxX: 2642, maxY: 2047 } }],
    ['50040_skin_SilverFeather03.json', { actions: ['in'],
      frame: { minX: -2216, minY: -2067, maxX: 2050, maxY: 2239 } }],
    ['50190_skin_psilica03.json', { actions: ['click2'],
      frame: { minX: -2722, minY: -695, maxX: 3077, maxY: 3406 } }],
    ['50300_skin_Reduvia05.json', { actions: ['in'],
      frame: { minX: -2626, minY: -2046, maxX: 2595, maxY: 2046 } }],
    ['50320_skin_Salticidae05.json', { actions: ['in'],
      frame: { minX: -2581, minY: -1602, maxX: 2696, maxY: 2031 } }],
    ['60020_skin_joyeuse04.json', { actions: ['in'],
      frame: { minX: -1400, minY: -1311, maxX: 1215, maxY: 957 } }],
    ['60020_skin_Joyeuse05.json', { actions: ['in'],
      frame: { minX: -2313, minY: -1385, maxX: 1795, maxY: 1838 } }],
    ['6003003_skin_Durandal01.json', { actions: ['in'],
      frame: { minX: -784, minY: -109, maxX: 910, maxY: 1926 } }],
    ['60030_skin_Durandal05.json', { actions: ['in'],
      frame: { minX: -2571, minY: -1986, maxX: 2513, maxY: 2115 } }],
    ['60050_skin_Naglering04.json', { actions: ['in'],
      frame: { minX: -2604, minY: -2043, maxX: 2626, maxY: 2032 } }],
    ['60050_skin_Naglering05.json', { actions: ['in'],
      frame: { minX: -1730, minY: -2056, maxX: 1769, maxY: 1771 } }],
    ['60090_skin_Curtana03.json', { actions: ['in'],
      frame: { minX: -1321, minY: -346, maxX: 1315, maxY: 2433 } }],
    ['60090_skin_Curtana04.json', { actions: ['in'],
      frame: { minX: -2185, minY: -1952, maxX: 2408, maxY: 2056 } }],
    ['60090_skin_Curtana05.json', { actions: ['in'],
      frame: { minX: -3211, minY: -2203, maxX: 3253, maxY: 2105 } }],
    ['60160_skin_Aymur05.json', { actions: ['click6'],
      frame: { minX: -2825, minY: -2145, maxX: 2826, maxY: 2039 } }],
    ['60210_skin_Longxian03a.json', { actions: ['in'],
      frame: { minX: -1875, minY: -2020, maxX: 1883, maxY: 2052 } }],
    ['60210_skin_Longxian03b.json', { actions: ['camera'],
      frame: { minX: -2861, minY: -2820, maxX: 2823, maxY: 2053 } }],
    ['60210_skin_Longxian04.json', { actions: ['click6', 'in'],
      frame: { minX: -2434, minY: -2034, maxX: 3699, maxY: 2050 } }],
    ['60310_skin_Tizona03.json', { actions: ['in'],
      frame: { minX: -2532, minY: -193, maxX: 2683, maxY: 3502 } }],
    ['70010_skin_Zeus04.json', { actions: ['in'],
      frame: { minX: -1920, minY: -63, maxX: 2045, maxY: 4030 } }],
    ['70030_skin_Poseidon03.json', { actions: ['in'],
      frame: { minX: -2343, minY: -2042, maxX: 2024, maxY: 2214 } }],
    ['70030_skin_poseidon04.json', { actions: ['in'],
      frame: { minX: -2489, minY: -2023, maxX: 2501, maxY: 1923 } }],
    ['70030_skin_Poseidon05.json', { actions: ['click1', 'click4_d', 'in'],
      frame: { minX: -3155, minY: -2112, maxX: 3167, maxY: 2013 } }],
    ['70050_skin_Hades03.json', { actions: ['click5'],
      frame: { minX: -1661, minY: -1453, maxX: 2095, maxY: 1656 } }],
    ['70090_skin_Ares04.json', { actions: ['in'],
      frame: { minX: -2203, minY: -1966, maxX: 1937, maxY: 1925 } }],
    ['70130_skin_Hera03.json', { actions: ['in'],
      frame: { minX: -2701, minY: -2155, maxX: 2517, maxY: 2142 } }],
    ['70130_skin_Hera04.json', { actions: ['in'],
      frame: { minX: -761, minY: -666, maxX: 789, maxY: 635 } }],
    ['70220_skin_Loki03.json', { actions: ['in'],
      frame: { minX: -2600, minY: -2297, maxX: 2661, maxY: 2487 } }],
    ['70240_skin_Skadi05.json', { actions: ['in'],
      frame: { minX: -3247, minY: -2047, maxX: 3249, maxY: 2073 } }],
    ['70310_skin_Atum03a.json', { actions: ['in'],
      frame: { minX: -2583, minY: -2047, maxX: 1980, maxY: 2049 } }],
    ['70310_skin_Atum06a.json', { actions: ['click4', 'guochang'],
      frame: { minX: -2713, minY: -956, maxX: 2713, maxY: 3168 } }],
    ['70330_skin_Anubis03.json', { actions: ['in'],
      frame: { minX: -2810, minY: -1962, maxX: 2169, maxY: 2117 } }],
    ['70350_skin_Nut03.json', { actions: ['in'],
      frame: { minX: -2258, minY: -2280, maxX: 1851, maxY: 2051 } }],
    ['70420_skin_Smelt04.json', { actions: ['in'],
      frame: { minX: -2389, minY: -1414, maxX: 2783, maxY: 2027 } }],
    ['70430_skin_Harvest03a.json', { actions: ['in'],
      frame: { minX: -3232, minY: -2059, maxX: 3235, maxY: 2051 } }],
    ['70450_skin_Midnight03.json', { actions: ['in'],
      frame: { minX: -876, minY: -706, maxX: 664, maxY: 616 } }],
    ['78010_skin_Lobera03a.json', { actions: ['click3'],
      frame: { minX: -1939, minY: -391, maxX: 2103, maxY: 2460 } }],
    ['78020_skin_CurtanaSP03b.json', { actions: ['click2', 'guochang'],
      frame: { minX: -3284, minY: -1433, maxX: 3139, maxY: 2546 } }],
    ['78020_skin_CurtanaSP03c.json', { actions: ['guochang'],
      frame: { minX: -3747, minY: -1350, maxX: 2824, maxY: 2551 } }],
    ['CG0013_MoonlightSharing_character.json', { actions: ['in'],
      frame: { minX: -2101, minY: -1347, maxX: 2032, maxY: 1298 } }],
    ['CG0014_GuardOfIronBastion_character.json', { actions: ['in'],
      frame: { minX: -1295, minY: -716, maxX: 1417, maxY: 749 } }],
    ['CG0021_CampingWithFireworks.json', { actions: ['in'],
      frame: { minX: -2084, minY: -1468, maxX: 2109, maxY: 1164 } }],
    ['CG0025_FantasticCurtainRaiser.json', { actions: ['in'],
      frame: { minX: -2727, minY: -2181, maxX: 1999, maxY: 1187 } }],
    ['CG0026_DoubleFeature.json', { actions: ['in'],
      frame: { minX: -2663, minY: -1863, maxX: 2807, maxY: 2060 } }],
    ['CG0031_AlleyCornerCrisis.json', { actions: ['click1'],
      frame: { minX: -2490, minY: -1578, maxX: 2399, maxY: 1572 } }],
    ['CG0050_StartingRaid.json', { actions: ['in'],
      frame: { minX: -2148, minY: -1457, maxX: 2017, maxY: 1598 } }],
    ['CG0052_ContentionArena.json', { actions: ['in'],
      frame: { minX: -1777, minY: -1260, maxX: 2049, maxY: 1206 } }],
    ['CG0055_Beachpicnic.json', { actions: ['in'],
      frame: { minX: -1242, minY: -740, maxX: 1223, maxY: 679 } }],
    ['CG0057_CuratedIndulgence.json', { actions: ['in'],
      frame: { minX: -2043, minY: -1111, maxX: 2044, maxY: 1110 } }],
    ['CG0069_DreamlikePicture.json', { actions: ['in'],
      frame: { minX: -2311, minY: -2853, maxX: 2649, maxY: 2608 } }],
    ['CG0072_CharmCheck.json', { actions: ['in'],
      frame: { minX: -2038, minY: -1378, maxX: 1998, maxY: 1359 } }],
    ['CG0078_TwoFairiesOFTheInkWish01.json', { actions: ['in'],
      frame: { minX: -2008, minY: -1178, maxX: 2050, maxY: 1190 } }],
    ['CG0079_BusyJourney.json', { actions: ['in'],
      frame: { minX: -1997, minY: -1304, maxX: 1880, maxY: 1534 } }],
    ['CG0085_TwinStarAttendantsA.json', { actions: ['guochang', 'in'],
      frame: { minX: -3911, minY: -438, maxX: 2722, maxY: 3292 } }],
    ['CG02.json', { actions: ['in'],
      frame: { minX: -1640, minY: -431, maxX: 2044, maxY: 1724 } }],
    ['CG04_SummerRendezvous.json', { actions: ['click2'],
      frame: { minX: -2890, minY: -566, maxX: 1996, maxY: 1541 } }],
    ['CG05_ShimmeringFeast.json', { actions: ['in'],
      frame: { minX: -1795, minY: -1272, maxX: 1908, maxY: 1127 } }],
  ]);

  const wideEdge = { TX_BG_black10: ['TX_BG_black10', 'TX_BG_black11', 'TX_BG_black12', 'TX_BG_black13'] };
  const frameMattes = new Map([
    ['20030_skin_Pyrock03b.json', { AAAkuang: ['AAAkuang'] }],
    ['20110_skin_Arpeggio07.json', { box: ['box'], box2: ['box2'] }],
    ['20140_skin_Capriccio04b.json', { tx_heiping4: ['tx_heiping4'] }],
    ['30180_skin_Machairodus05b.json', { bgkuang1: ['bgkuang1'], bgkuang2: ['bgkuang2'] }],
    ['30300_skin_Bluebuck03c.json', wideEdge],
    ['40230_skin_Scorching03b.json', { tx_heiping2: ['tx_heiping2'] }],
    ['60310_skin_Tizona04a.json', { tx_heiping4: ['tx_heiping4'] }],
    ['60310_skin_Tizona04b.json', { tx_heiping4: ['tx_heiping4'] }],
    ['70310_skin_Atum06b.json', { TX_BG_black: ['TX_BG_black', 'TX_BG_black2', 'TX_BG_black3', 'TX_BG_black4'] }],
    ['70400_skin_LycorisRadiata03b.json', { heikuang: ['heikuang'] }],
    ['78050_skin_Osiris03a.json', wideEdge],
    ['78050_skin_Osiris03b.json', wideEdge],
    ['78050_skin_Osiris03b_ASMR.json', wideEdge],
  ]);

  function modelFrame(skeletonFile, animation) {
    const scene = actionFrames.get(skeletonFile);
    const shot = scene?.shots?.get(animation);
    if (shot) return shot;
    if (scene?.actions.includes(animation)) return scene.frame;
    const stage = stageCameraFrames.get(skeletonFile);
    if (stage?.actions.includes(animation)) return stage.frame;
    return authoredFrames.get(skeletonFile);
  }

  function interactionFrame(layer, animation) {
    if (!layer) return null;
    const frame = modelFrame(layer.def.skeleton.split('/').pop(), animation);
    const { x, y, scaleX, scaleY, rotation } = layer.def.render;
    if (!frame || rotation || !(scaleX > 0 && scaleY > 0)) return null;
    return {
      minX: x + frame.minX * scaleX, minY: y + frame.minY * scaleY,
      maxX: x + frame.maxX * scaleX, maxY: y + frame.maxY * scaleY,
    };
  }

  function drawLayer(renderer, layer, animation = layer.state?.getCurrent(0)?.animation.name) {
    const { skeleton } = layer;
    const pma = layer.pma ?? Boolean(layer.atlas.pages[0]?.pma);
    const file = layer.source?.skel ?? layer.def?.skeleton?.split('/').pop();
    const removeTyrfingEdges = file === '60150_skin_Tyrfing05.json' && tyrfingSceneShots.includes(animation);
    const mattes = removeTyrfingEdges ? wideEdge : frameMattes.get(file);
    // Osiris uses the edge texture as part of the opening reveal.
    // Cinnabar's changing close-up mask is intentionally outside this list.
    if (!mattes || (file === '78050_skin_Osiris03a.json' && animation === 'in')) {
      renderer.drawSkeleton(skeleton, pma);
      return;
    }
    const muted = [];
    for (const [region, names] of Object.entries(mattes)) {
      for (const name of names) {
        const slot = skeleton.findSlot(name);
        if (slot?.attachment?.region?.name !== region || slot.color.a <= 0) continue;
        muted.push([slot, slot.color.a]);
        slot.color.a = 0;
      }
    }
    try { renderer.drawSkeleton(skeleton, pma); }
    finally { for (const [slot, opacity] of muted) slot.color.a = opacity; }
  }

  window.CrossCoreSceneFraming = { modelFrame, interactionFrame, drawLayer };
})();
