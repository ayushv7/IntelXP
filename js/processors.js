/* ==========================================================================
   processors.js — THE ONLY FILE YOU NEED TO EDIT FOR PRODUCT DATA
   --------------------------------------------------------------------------
   All processor names, specs, images, explanations and comparison data live
   here. Values marked `placeholder: true` (or shown with a PLACEHOLDER tag in
   the UI) are illustrative. Verify every value against official sources
   (https://www.intel.com/content/www/us/en/ark.html) and your store's actual
   SKUs before using this in a public retail setting.

   NOTE ON ACCURACY: Do not add benchmark numbers you have not verified.
   The NPU accelerates sustained, low-power AI workloads (e.g. background
   blur, noise suppression, live captions). It does NOT directly increase
   gaming FPS. Graphics performance and AI upscaling (Intel XeSS) run on the
   GPU.
   ========================================================================== */

window.PROCESSOR_DATA = {
  /* Global switch: shows "PLACEHOLDER" badges throughout the UI. Set to false
     once every value below has been verified. */
  showPlaceholderBadges: true,

  /* Specs marked `key: true` are the ones shown on the recommendation screen (max ~4 keeps it uncluttered). */

  /* Which quiz answers map to which tier. Highest applicable tier wins. */
  tierRules: {
    top:   ['gaming', 'creation'],
    mid:   ['work', 'studying', 'entertainment'],
    entry: ['browsing']
  },
  tierOrder: ['entry', 'mid', 'top'],

  /* Quiz options (id must match tierRules) */
  useCases: [
    { id: 'studying',      label: 'Studying',          icon: 'book',   blurb: 'Notes, research, essays' },
    { id: 'work',          label: 'Work',              icon: 'brief',  blurb: 'Docs, calls, multitasking' },
    { id: 'entertainment', label: 'Entertainment',     icon: 'play',   blurb: 'Streaming, music, movies' },
    { id: 'gaming',        label: 'Gaming',            icon: 'pad',    blurb: 'Esports, AAA, streaming' },
    { id: 'creation',      label: 'Content Creation',  icon: 'cam',    blurb: 'Video, photo, 3D, music' },
    { id: 'browsing',      label: 'Everyday Browsing', icon: 'globe',  blurb: 'Web, email, social' }
  ],

  /* Why each use case benefits — used to personalise the recommendation. */
  useCaseReasons: {
    studying:      'Long battery life and NPU-powered features like live captions and noise suppression keep lectures and study calls clear.',
    work:          'Hybrid performance cores plus efficient cores keep dozens of tabs, docs and video calls responsive at once.',
    entertainment: 'Intel Arc graphics with modern media engines handle high-resolution streaming smoothly and efficiently.',
    gaming:        'Integrated Intel Arc graphics with AI-based XeSS upscaling help deliver sharper visuals at smoother frame rates.',
    creation:      'CPU, GPU and NPU share the load: GPU for rendering and effects, NPU for sustained AI tasks, CPU for fast edits.',
    browsing:      'Snappy everyday performance with excellent efficiency for all-day web, email and social.'
  },

  processors: {
    top: {
      id: 'ultra9',
      family: 'Intel® Core™ Ultra 9',
      name: 'Intel® Core™ Ultra 9 Processor',
      model: '285H',                       // PLACEHOLDER model — verify SKU in store
      tagline: 'Maximum performance for gamers & creators',
      image: 'assets/chip-ultra9.svg',
      accent: '#ffc845',
      placeholder: true,
      specs: [
        { key: true, label: 'Cores / Threads', value: '16 cores (6P + 8E + 2LP-E) / 16 threads' },
        { key: true, label: 'Max Turbo',       value: 'Up to 5.4 GHz' },
        { key: true, label: 'Graphics (GPU)',  value: 'Intel® Arc™ 140T GPU' },
        { label: 'AI Engine (NPU)', value: 'Intel® AI Boost NPU' },
        { key: true, label: 'Platform AI',     value: 'Up to 99 TOPS (CPU + GPU + NPU)' },
        { label: 'Memory',          value: 'Up to DDR5-6400 / LPDDR5x-8400' }
      ],
      roles: {
        cpu: 'Performance cores tackle game logic, compiling and fast edits; efficient cores run background apps.',
        gpu: 'Intel Arc graphics render your game and run AI upscaling (XeSS) for sharper frames.',
        npu: 'Handles sustained AI — stream background removal, noise suppression, effects — at low power.'
      }
    },
    mid: {
      id: 'ultra7',
      family: 'Intel® Core™ Ultra 7',
      name: 'Intel® Core™ Ultra 7 Processor',
      model: '255H',                       // PLACEHOLDER model — verify SKU in store
      tagline: 'Balanced AI performance for study, work & play',
      image: 'assets/chip-ultra7.svg',
      accent: '#00c7fd',
      placeholder: true,
      specs: [
        { key: true, label: 'Cores / Threads', value: '16 cores (6P + 8E + 2LP-E) / 16 threads' },
        { key: true, label: 'Max Turbo',       value: 'Up to 5.1 GHz' },
        { key: true, label: 'Graphics (GPU)',  value: 'Intel® Arc™ 140T GPU' },
        { label: 'AI Engine (NPU)', value: 'Intel® AI Boost NPU' },
        { key: true, label: 'Platform AI',     value: 'Up to 96 TOPS (CPU + GPU + NPU)' },
        { label: 'Memory',          value: 'Up to DDR5-6400 / LPDDR5x-8400' }
      ],
      roles: {
        cpu: 'Hybrid cores keep multitasking smooth — docs, browser tabs and calls all at once.',
        gpu: 'Intel Arc graphics for smooth video, light creative work and casual-to-mainstream gaming.',
        npu: 'Runs AI features like background blur, eye contact and live captions efficiently, saving battery.'
      }
    },
    entry: {
      id: 'ultra5',
      family: 'Intel® Core™ Ultra 5',
      name: 'Intel® Core™ Ultra 5 Processor',
      model: '225H',                       // PLACEHOLDER model — verify SKU in store
      tagline: 'Smart, efficient AI PC for everyday life',
      image: 'assets/chip-ultra5.svg',
      accent: '#8fd3ff',
      placeholder: true,
      specs: [
        { key: true, label: 'Cores / Threads', value: '14 cores (4P + 8E + 2LP-E) / 14 threads' },
        { key: true, label: 'Max Turbo',       value: 'Up to 4.9 GHz' },
        { key: true, label: 'Graphics (GPU)',  value: 'Intel® Arc™ 130T GPU' },
        { label: 'AI Engine (NPU)', value: 'Intel® AI Boost NPU' },
        { key: true, label: 'Platform AI',     value: 'Up to 74 TOPS (CPU + GPU + NPU)' },
        { label: 'Memory',          value: 'Up to DDR5-6400 / LPDDR5x-8400' }
      ],
      roles: {
        cpu: 'Efficient cores keep browsing and email snappy while sipping power.',
        gpu: 'Intel Arc graphics for smooth streaming and everyday visuals.',
        npu: 'On-device AI for video-call effects and captions without draining your battery.'
      }
    }
  },

  /* Side-by-side comparison. `winner`: 'intel' | 'competitor' | 'tie'.
     ALL competitor values are PLACEHOLDERS — replace with verified data. */
  comparisons: {
    top: {
      competitorName: 'Competitor Processor X9',   // PLACEHOLDER name
      competitorImage: 'assets/chip-competitor.svg',
      rows: [
        { label: 'Dedicated NPU for on-device AI', intel: 'Yes — Intel AI Boost', competitor: 'Placeholder', winner: 'intel' },
        { label: 'AI upscaling for games',         intel: 'Intel XeSS (GPU)',      competitor: 'Placeholder', winner: 'intel' },
        { label: 'Max turbo frequency',            intel: 'Up to 5.4 GHz',         competitor: '0.0 GHz (placeholder)', winner: 'intel' },
        { label: 'Total cores',                    intel: '16',                    competitor: '00 (placeholder)', winner: 'tie' },
        { label: 'Platform AI TOPS',               intel: 'Up to 99',              competitor: '00 (placeholder)', winner: 'intel' },
        { label: 'Thunderbolt™ 4 connectivity',    intel: 'Supported (platform)',  competitor: 'Placeholder', winner: 'intel' }
      ],
      advantages: [
        'CPU, GPU and NPU work together so AI tasks never steal frames from your game.',
        'Intel XeSS uses AI on the Arc GPU to upscale frames for sharper visuals.',
        'Hybrid architecture + Intel Thread Director route tasks to the right core.'
      ]
    },
    mid: {
      competitorName: 'Competitor Processor X7',   // PLACEHOLDER name
      competitorImage: 'assets/chip-competitor.svg',
      rows: [
        { label: 'Dedicated NPU for on-device AI', intel: 'Yes — Intel AI Boost', competitor: 'Placeholder', winner: 'intel' },
        { label: 'AI video-call effects',          intel: 'Runs on NPU (low power)', competitor: 'Placeholder', winner: 'intel' },
        { label: 'Max turbo frequency',            intel: 'Up to 5.1 GHz',         competitor: '0.0 GHz (placeholder)', winner: 'intel' },
        { label: 'Total cores',                    intel: '16',                    competitor: '00 (placeholder)', winner: 'tie' },
        { label: 'Platform AI TOPS',               intel: 'Up to 96',              competitor: '00 (placeholder)', winner: 'intel' },
        { label: 'Integrated graphics',            intel: 'Intel Arc 140T',        competitor: 'Placeholder', winner: 'intel' }
      ],
      advantages: [
        'NPU handles always-on AI effects so your CPU stays free for multitasking.',
        'Efficient cores stretch battery life through a full day of classes or work.',
        'Intel Arc graphics for smooth streaming, editing and casual gaming.'
      ]
    },
    entry: {
      competitorName: 'Competitor Processor X5',   // PLACEHOLDER name
      competitorImage: 'assets/chip-competitor.svg',
      rows: [
        { label: 'Dedicated NPU for on-device AI', intel: 'Yes — Intel AI Boost', competitor: 'Placeholder', winner: 'intel' },
        { label: 'Max turbo frequency',            intel: 'Up to 4.9 GHz',         competitor: '0.0 GHz (placeholder)', winner: 'intel' },
        { label: 'Total cores',                    intel: '14',                    competitor: '00 (placeholder)', winner: 'tie' },
        { label: 'Platform AI TOPS',               intel: 'Up to 74',              competitor: '00 (placeholder)', winner: 'intel' },
        { label: 'Integrated graphics',            intel: 'Intel Arc 130T',        competitor: 'Placeholder', winner: 'intel' }
      ],
      advantages: [
        'Everyday AI features run on the NPU for better battery life.',
        'Snappy hybrid cores for browsing, email and streaming.',
        'Room to grow into AI apps as they arrive.'
      ]
    }
  }
};
