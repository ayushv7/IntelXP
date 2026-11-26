/* ==========================================================================
   processors.js: product data for AI PC Quest (v2 schema)
   --------------------------------------------------------------------------
   Specs checked in Nov 2026 against Intel's Core Ultra Series 3 Quick
   Reference Guide / CES 2026 press deck, AMD's Ryzen AI 400 QRG, Qualcomm's
   Snapdragon X2 product pages, and independent reviews (sources at bottom).

   The shopper is sold a LAPTOP, not a chip. Each tier has a `laptop` block
   that the recommendation and end screens lead with; chip specs sit behind a
   "Tech specs" toggle.

   NPU = the laptop's built-in AI engine. It runs sustained, low-power AI
   (live captions, video-call effects, on-device assistants). It does NOT
   raise gaming FPS; the GPU (Intel Arc + XeSS) does that.
   ========================================================================== */

window.PROCESSOR_DATA = {
  showPlaceholderBadges: false,

  /* Highest tier among the picks wins. Extra rule in app.js: someone who picks
     3+ options that all map to "everyday" moves up to "pro". */
  tierRules: {
    gaming:   ['gaming'],
    creator:  ['creation'],
    pro:      ['work'],
    everyday: ['studying', 'entertainment', 'browsing']
  },
  tierOrder: ['everyday', 'pro', 'creator', 'gaming'],
  multitaskBump: { from: 'everyday', to: 'pro', minPicks: 3 },

  useCases: [
    { id: 'studying',      label: 'Studying',          icon: 'book',  blurb: 'Notes, research, essays' },
    { id: 'work',          label: 'Work',              icon: 'brief', blurb: 'Docs, calls, multitasking' },
    { id: 'entertainment', label: 'Entertainment',     icon: 'play',  blurb: 'Streaming, music, movies' },
    { id: 'gaming',        label: 'Gaming',            icon: 'pad',   blurb: 'Esports, AAA games' },
    { id: 'creation',      label: 'Content Creation',  icon: 'cam',   blurb: 'Video, photo, design' },
    { id: 'browsing',      label: 'Everyday Browsing', icon: 'globe', blurb: 'Web, email, social' }
  ],

  /* One short, plain-language line per pick. */
  useCaseReasons: {
    studying:      'Its built-in AI engine can summarise notes and caption lectures on the laptop itself.',
    work:          'Fast cores keep many apps and video calls smooth, with AI noise removal and background blur.',
    entertainment: 'Smooth streaming, plus live captions and translation powered by on-device AI.',
    gaming:        'Intel Arc B390 graphics and XeSS AI upscaling play modern games on a thin laptop.',
    creation:      'Up to 16 CPU cores for editing, design and coding, with AI tools that run locally.',
    browsing:      'Quick and quiet for everyday browsing, email and social.'
  },

  processors: {
    everyday: {
      id: 'everyday',
      family: 'Intel® Core™ Ultra 5',
      name: 'Intel® Core™ Ultra 5 processor',
      model: '325',
      tagline: 'A smart, light AI laptop for study and everyday life',
      image: 'assets/chip-ultra5.svg',
      accent: '#8fd3ff',
      placeholder: false,
      laptop: {
        title: 'Everyday AI Laptop',
        headline: 'An AI laptop with Intel® Core™ Ultra 5',
        benefits: [
          { icon: 'ai',     text: 'Copilot+ PC: AI features run on the laptop itself' },
          { icon: 'shield', text: 'On-device AI keeps working without internet' },
          { icon: 'apps',   text: 'Runs every Windows app natively' }
        ],
        examples: [
          { name: 'Dell XPS 14',                  note: 'Core Ultra 5 325 configuration' },
          { name: 'Lenovo IdeaPad Slim 3 Gen 11', note: 'Core Ultra Series 3' },
          { name: 'Samsung Galaxy Book6',         note: 'Core Ultra 5 / 7 options' }
        ],
        alsoIn: 'Also great with Core Ultra 5 335 / 332 / 322'
      },
      specs: [
        { key: true, label: 'CPU cores',       value: '8' },
        { key: true, label: 'Max turbo',       value: '4.5 GHz' },
        { key: true, label: 'AI engine (NPU)', value: '47 TOPS' },
        { key: true, label: 'Graphics',        value: 'Intel Graphics, 4 Xe3 cores' },
        { label: 'Copilot+ PC',                value: 'Yes' },
        { label: 'Generation',                 value: 'Core Ultra Series 3' }
      ],
      roles: {
        cpu: 'Runs your apps and browser fast and efficiently.',
        gpu: 'Smooth video streaming and everyday visuals.',
        npu: 'Runs AI features like captions and video-call effects at low power.'
      }
    },

    pro: {
      id: 'pro',
      family: 'Intel® Core™ Ultra 7',
      name: 'Intel® Core™ Ultra 7 processor',
      model: '355',
      tagline: 'A faster AI laptop for work and multitasking',
      image: 'assets/chip-ultra7.svg',
      accent: '#00c7fd',
      placeholder: false,
      laptop: {
        title: 'Pro AI Laptop',
        headline: 'An AI laptop with Intel® Core™ Ultra 7',
        benefits: [
          { icon: 'ai',     text: 'AI meeting tools: noise removal, blur, captions' },
          { icon: 'bolt',   text: 'Up to 4.7 GHz for smooth multitasking' },
          { icon: 'apps',   text: 'Runs every Windows app natively' }
        ],
        examples: [
          { name: 'Dell XPS 13 (2026)',   note: 'Core Ultra 7 Series 3' },
          { name: 'Samsung Galaxy Book6', note: 'Core Ultra 7 options' }
        ],
        alsoIn: 'Also great with Core Ultra 7 365 or Core Ultra 7 258V'
      },
      specs: [
        { key: true, label: 'CPU cores',       value: '8' },
        { key: true, label: 'Max turbo',       value: '4.7 GHz' },
        { key: true, label: 'AI engine (NPU)', value: '49 TOPS' },
        { key: true, label: 'Graphics',        value: 'Intel Graphics, 4 Xe3 cores' },
        { label: 'Copilot+ PC',                value: 'Yes' },
        { label: 'Generation',                 value: 'Core Ultra Series 3' }
      ],
      roles: {
        cpu: 'Keeps docs, tabs and calls responsive at once.',
        gpu: 'Smooth video and light creative work.',
        npu: 'Runs video-call AI effects without slowing your apps.'
      }
    },

    creator: {
      id: 'creator',
      family: 'Intel® Core™ Ultra 7',
      name: 'Intel® Core™ Ultra 7 processor',
      model: '356H',
      tagline: 'A powerful AI laptop for creators',
      image: 'assets/chip-ultra7.svg',
      accent: '#00c7fd',
      placeholder: false,
      laptop: {
        title: 'Creator AI Laptop',
        headline: 'An AI laptop with Intel® Core™ Ultra 7 H',
        benefits: [
          { icon: 'bolt',   text: '16 CPU cores for editing and exports' },
          { icon: 'ai',     text: '50 TOPS AI engine for creative AI tools' },
          { icon: 'apps',   text: 'Runs pro apps and plug-ins natively' }
        ],
        examples: [],  // confirm models with the store's stock
        alsoIn: 'Also great with Core Ultra 7 366H, or Core Ultra 5 338H if you game too'
      },
      specs: [
        { key: true, label: 'CPU cores',       value: '16' },
        { key: true, label: 'Max turbo',       value: '4.7 GHz' },
        { key: true, label: 'AI engine (NPU)', value: '50 TOPS' },
        { key: true, label: 'Max memory',      value: 'Up to 128 GB' },
        { label: 'Graphics',                   value: 'Intel Graphics, 4 Xe3 cores' },
        { label: 'Generation',                 value: 'Core Ultra Series 3' }
      ],
      roles: {
        cpu: '16 cores handle edits, exports and code builds.',
        gpu: 'Accelerates effects and previews.',
        npu: 'Runs AI tools like background removal at low power.'
      }
    },

    gaming: {
      id: 'gaming',
      family: 'Intel® Core™ Ultra X9',
      name: 'Intel® Core™ Ultra X9 processor',
      model: '388H',
      tagline: 'A thin AI laptop that games like a gaming laptop',
      image: 'assets/chip-ultra9.svg',
      accent: '#ffc845',
      placeholder: false,
      laptop: {
        title: 'Gaming AI Laptop',
        headline: 'An AI laptop with Intel® Core™ Ultra X9',
        benefits: [
          { icon: 'game',   text: 'Intel Arc B390 graphics for modern games' },
          { icon: 'ai',     text: 'XeSS AI upscaling and frame generation' },
          { icon: 'bolt',   text: '180 TOPS of total AI power' }
        ],
        examples: [
          { name: 'HP OmniBook 7 OLED',    note: 'Core Ultra X7 358H' },
          { name: 'Dell XPS 14 / XPS 16',  note: 'X7 358H or X9 388H' },
          { name: 'ASUS ExpertBook Ultra', note: 'Core Ultra X7 358H' }
        ],
        alsoIn: 'Also great with Core Ultra X7 358H / 368H (same Arc B390 graphics)'
      },
      specs: [
        { key: true, label: 'Graphics',        value: 'Intel Arc B390, 12 Xe3 cores' },
        { key: true, label: 'CPU cores',       value: '16' },
        { key: true, label: 'Max turbo',       value: '5.1 GHz' },
        { key: true, label: 'Total AI',        value: '180 TOPS' },
        { label: 'AI engine (NPU)',            value: '50 TOPS' },
        { label: 'Generation',                 value: 'Core Ultra Series 3' }
      ],
      roles: {
        cpu: 'Fast cores for game logic and streaming.',
        gpu: 'Arc B390 renders games and runs XeSS AI upscaling.',
        npu: 'Handles AI extras like stream background removal at low power.'
      }
    }
  },

  /* winner: 'intel' | 'competitor' | 'tie'. Every row is verified.
     matters: quiz picks the row is most relevant to (highlight these). */
  comparisons: {
    everyday: {
      competitorName: 'Snapdragon X2 Plus (6-core)',
      competitorImage: 'assets/chip-competitor.svg',
      rows: [
        { label: 'Windows apps & games', intel: 'Run natively', competitor: 'Mostly emulated; some online games won’t start', winner: 'intel', matters: ['studying', 'gaming', 'entertainment', 'browsing'] },
        { label: 'CPU cores',            intel: '8',            competitor: '6',        winner: 'intel',      matters: ['studying', 'work'] },
        { label: 'Max CPU speed',        intel: '4.5 GHz',      competitor: '4.0 GHz',  winner: 'intel',      matters: ['browsing', 'studying'] },
        { label: 'AI engine (NPU)',      intel: '47 TOPS',      competitor: '80 TOPS',  winner: 'competitor', matters: [] },
        { label: 'Copilot+ PC',          intel: 'Yes',          competitor: 'Yes',      winner: 'tie',        matters: [] }
      ],
      advantages: ['Every Windows app and game runs natively. No emulation surprises.']
    },
    pro: {
      competitorName: 'Snapdragon X2 Plus (10-core)',
      competitorImage: 'assets/chip-competitor.svg',
      rows: [
        { label: 'Windows apps & games', intel: 'Run natively', competitor: 'Mostly emulated; some online games won’t start', winner: 'intel', matters: ['work', 'gaming', 'entertainment'] },
        { label: 'Max CPU speed',        intel: '4.7 GHz',      competitor: '4.0 GHz',  winner: 'intel',      matters: ['work'] },
        { label: 'CPU cores',            intel: '8',            competitor: '10',       winner: 'competitor', matters: [] },
        { label: 'AI engine (NPU)',      intel: '49 TOPS',      competitor: '80 TOPS',  winner: 'competitor', matters: [] }
      ],
      advantages: ['Your work apps, plug-ins and VPNs run natively on Intel.']
    },
    creator: {
      competitorName: 'Snapdragon X2 Elite (12-core)',
      competitorImage: 'assets/chip-competitor.svg',
      rows: [
        { label: 'CPU cores',            intel: '16',           competitor: '12',         winner: 'intel',      matters: ['creation', 'work'] },
        { label: 'Pro apps & plug-ins',  intel: 'Run natively', competitor: 'Many emulated', winner: 'intel',   matters: ['creation', 'work', 'gaming'] },
        { label: 'Max CPU speed',        intel: '4.7 GHz',      competitor: '4.7 GHz',    winner: 'tie',        matters: [] },
        { label: 'Max memory',           intel: '128 GB',       competitor: '128 GB',     winner: 'tie',        matters: [] },
        { label: 'AI engine (NPU)',      intel: '50 TOPS',      competitor: '80 TOPS',    winner: 'competitor', matters: [] }
      ],
      advantages: ['More cores, and creative apps and plug-ins run natively.']
    },
    gaming: {
      competitorName: 'AMD Ryzen™ AI 9 HX 470',
      competitorImage: 'assets/chip-competitor.svg',
      rows: [
        { label: 'Built-in gaming graphics', intel: 'Arc B390: 64 fps', competitor: 'Radeon 890M: 41 fps', winner: 'intel', matters: ['gaming', 'creation'],
          note: 'Same game at 1080p in PC Gamer’s test. HX 470 uses the same Radeon 890M.' },
        { label: 'AI multi-frame generation', intel: 'Yes (XeSS 3)', competitor: 'No',  winner: 'intel',      matters: ['gaming'] },
        { label: 'CPU cores / threads',       intel: '16 / 16',      competitor: '12 / 24', winner: 'tie',    matters: [] },
        { label: 'AI engine (NPU)',           intel: '50 TOPS',      competitor: '55 TOPS', winner: 'competitor', matters: [] },
        { label: 'Max CPU speed',             intel: '5.1 GHz',      competitor: '5.2 GHz', winner: 'competitor', matters: [] }
      ],
      advantages: ['About 1.5× the frame rate in PC Gamer’s test, plus AI frame generation.']
    }
  },

  sources: [
    'Intel Core Ultra Series 3 Quick Reference Guide and CES 2026 press deck',
    'Notebookcheck: Core Ultra X9 388H, 50 TOPS NPU, 180 TOPS chip AI; all Panther Lake chips meet Copilot+ minimum',
    'AMD Ryzen AI 400 Series quick reference guide',
    'Qualcomm Snapdragon X2 Plus / X2 Elite product pages; Tom’s Hardware X2 Elite spec table',
    'PC Gamer Panther Lake benchmarks: Arc B390 vs Radeon 890M',
    'TweakTown / Hardware Canucks: ARC Raiders, PUBG, Battlefield 6 failed to load on Snapdragon X2 Elite',
    'Intel XeSS 3 developer page (multi-frame generation on Intel hardware)',
    'India listings: 91mobiles, Fonearena, techstoriesindia, smartprix (2026)'
  ]
};
