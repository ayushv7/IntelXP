/* ==========================================================================
   laptops.js: budget-aware chip + laptop data (Intel models only)
   lastUpdated: 2026-11-27
   Prices are approximate India prices seen online in 2026 (launch / listed /
   offer). They change often: verify before showing in store.
   Competitor chips live only in processors.js (comparison screen).
   ========================================================================== */

window.BUDGET_DATA = {
  lastUpdated: '2026-11-27',
  currency: '₹',

  /* Preset budget tiers: `max` is what gets stored as state.budget. */
  budgetTiers: [
    { id: 'b1', label: 'Under ₹80k',     max: 80000 },
    { id: 'b2', label: '₹80k – ₹1.2L',   max: 120000 },
    { id: 'b3', label: '₹1.2L – ₹1.8L',  max: 180000 },
    { id: 'b4', label: '₹1.8L+',         max: Infinity }
  ],

  /* performanceTier: higher = more capable. minLaptopPrice = cheapest verified
     laptop with that chip. idealFor = quiz tier from processors.js. */
  chips: {
    '225H': { name: 'Intel® Core™ Ultra 5 225H',  performanceTier: 1, minLaptopPrice: 67499,  copilotPlus: false, npuTops: 13,
              note: 'Intel AI PC (13 TOPS NPU), not a Copilot+ PC' },
    '255H': { name: 'Intel® Core™ Ultra 7 255H',  performanceTier: 2, minLaptopPrice: 83990,  copilotPlus: false, npuTops: 13,
              note: 'Intel AI PC with Arc 140T graphics, not a Copilot+ PC' },
    '322':  { name: 'Intel® Core™ Ultra 5 322',   performanceTier: 3, minLaptopPrice: 121990, copilotPlus: true,  npuTops: 46, idealFor: 'everyday' },
    '355':  { name: 'Intel® Core™ Ultra 7 355',   performanceTier: 4, minLaptopPrice: 104990, copilotPlus: true,  npuTops: 49, idealFor: 'pro' },
    '356H': { name: 'Intel® Core™ Ultra 7 356H',  performanceTier: 5, minLaptopPrice: 169990, copilotPlus: true,  npuTops: 50, idealFor: 'creator' },
    '358H': { name: 'Intel® Core™ Ultra X7 358H', performanceTier: 6, minLaptopPrice: 249990, copilotPlus: true,  npuTops: 50, idealFor: 'gaming' }
  },

  /* tags: portable | student | oled | creator | gaming | business | big-screen */
  laptops: [
    { brand: 'ASUS', name: 'Vivobook 16', sku: 'X1607CA-MB142WS', chip: '225H', ram: '16GB', storage: '512GB',
      price: 67499, tags: ['student', 'big-screen'],
      whyItFits: 'The most affordable Intel Core Ultra laptop here, with a big 16" screen for study.' },
    { brand: 'Motorola', name: 'Motobook 60 Pro', sku: '83NY000AIN', chip: '225H', ram: '16GB', storage: '1TB',
      price: 73990, tags: ['student', 'portable'],
      whyItFits: 'Budget Core Ultra with a roomy 1TB SSD for notes and media.' },
    { brand: 'ASUS', name: 'Vivobook S14', sku: 'S3407CA-LY084WS', chip: '255H', ram: '16GB', storage: '512GB',
      price: 83990, tags: ['portable', 'student'],
      whyItFits: 'Core Ultra 7 power under ₹85k, with Arc graphics for light gaming.' },
    { brand: 'ASUS', name: 'Zenbook 14 OLED', sku: 'UX3405CA-PZ163WS', chip: '255H', ram: '32GB', storage: '1TB',
      price: 119990, tags: ['portable', 'oled', 'creator'],
      whyItFits: 'OLED screen and 32GB memory for creative work on the go.' },

    { brand: 'Samsung', name: 'Galaxy Book6 (16")', sku: 'NP760VJG-KG2', chip: '355', ram: '16GB', storage: '512GB',
      price: 104990, tags: ['big-screen', 'business'],
      whyItFits: 'The lowest-priced Core Ultra Series 3 Copilot+ PC we found (offer price).' },
    { brand: 'Samsung', name: 'Galaxy Book6 (14")', sku: 'NP740VJG-KG2IN', chip: '355', ram: '16GB', storage: '512GB',
      price: 124990, tags: ['portable', 'business'], where: 'Reliance Digital',
      whyItFits: 'Light 14" Copilot+ PC for work and calls.' },
    { brand: 'Lenovo', name: 'IdeaPad Slim 5 (16", 120Hz)', sku: '83S6007TIN', chip: '322', ram: '16GB', storage: '512GB',
      price: 121990, tags: ['student', 'big-screen'],
      whyItFits: 'Big, smooth 120Hz screen and a 46 TOPS AI engine for study.' },
    { brand: 'Lenovo', name: 'IdeaPad Slim 5 (14", OLED)', sku: '83S5005LIN', chip: '322', ram: '16GB', storage: '512GB',
      price: 126990, tags: ['student', 'portable', 'oled'],
      whyItFits: 'Compact OLED Copilot+ PC that is easy to carry to class.' },
    { brand: 'Lenovo', name: 'IdeaPad Slim 5 (14", OLED)', sku: '83S5005KIN', chip: '355', ram: '16GB', storage: '512GB',
      price: 136990, tags: ['portable', 'oled', 'business'],
      whyItFits: 'OLED, Core Ultra 7 and Copilot+ AI in a light 14" body.' },
    { brand: 'Lenovo', name: 'Yoga Slim 7 Aura Edition', sku: '83QM0048IN', chip: '355', ram: '16GB', storage: '512GB',
      price: 160990, tags: ['portable', 'oled', 'creator'],
      whyItFits: 'Premium thin-and-light with an OLED display.' },

    { brand: 'Samsung', name: 'Galaxy Book6 Pro (14")', sku: 'NP940XJG-KG3', chip: '356H', ram: '16GB', storage: '512GB',
      price: 169990, tags: ['creator', 'portable'],
      whyItFits: '16-core Core Ultra 7 H for editing, in a slim Pro design.' },
    { brand: 'ASUS', name: 'ExpertBook P5 (14")', sku: 'P5405CAA-NZ0099WS', chip: '356H', ram: '32GB', storage: '1TB',
      price: 190990, tags: ['creator', 'business'],
      whyItFits: '16 cores plus 32GB memory for heavy multitasking.' },

    { brand: 'HP', name: 'OmniBook 7 OLED 14', sku: '14-hg0062TU', chip: '358H', ram: '32GB', storage: '1TB',
      price: 249990, tags: ['gaming', 'creator', 'oled', 'portable'],
      whyItFits: 'Arc B390 graphics game in a thin 14" OLED laptop.' },
    { brand: 'Dell', name: 'XPS 16 (2026)', sku: 'DA16260', chip: '358H', ram: '32GB', storage: '1TB',
      price: 328490, tags: ['gaming', 'creator', 'big-screen'],
      whyItFits: 'Big-screen XPS with Arc B390 for games and creative work.' },
    { brand: 'ASUS', name: 'ExpertBook Ultra', sku: 'B9406CAA-TH0934WS', chip: '358H', ram: '64GB', storage: '2TB',
      price: 349990, tags: ['business', 'creator', 'portable'],
      whyItFits: 'Maxed-out 64GB/2TB with Arc B390 graphics.' }
  ]
};
