// Types
export type ProductType = "tshirt" | "pillow" | "shoes" | "phonecase" | "wallart" | "hoodie" | "coffecup" | "totebag" | "blanket" | "earrings" | "sofa" | "scarf" | "backpack" | "lamp" | "dress" | "jean" | "plate" | "notebook" | "shoulderbag" | "vase" | "toys" | "vechile" | "glasses" | "watches" ;

export interface ProductImages {
  [key: string]: string[];
}

export interface ProductSpecificDesigns {
  [key: string]: {
    [category: string]: string[];
  };
}

// Product Images
export const defaultProductImages: Record<ProductType, string[]> = {
  tshirt: ["/designs/tshirt/tshirt1.jpg", "/designs/tshirt/tshirt2.jpg", "/designs/tshirt/tshirt3.jpg"],
  pillow: ["/designs/pillow/pillow1.jpg", "/designs/pillow/pillow2.jpg", "/designs/pillow/pillow3.jpg"],
  shoes: ["/designs/shoes/shoes1.jpg", "/designs/shoes/shoes2.jpg", "/designs/shoes/shoes3.jpg"],
  phonecase: ["/designs/phonecase/phonecase1.jpg", "/designs/phonecase/phonecase2.jpg", "/designs/phonecase/phonecase3.jpg"],
  wallart: ["/designs/wallart/wallart1.jpg", "/designs/wallart/wallart2.jpg", "/designs/wallart/wallart3.jpg"],
  hoodie: ["/designs/hoodie/hoodie1.jpg", "/designs/hoodie/hoodie2.jpg", "/designs/hoodie/hoodie3.jpg"],
  coffecup: ["/designs/coffecup/coffecup1.jpg", "/designs/coffecup/coffecup2.jpg", "/designs/coffecup/coffecup3.jpg"],
  totebag: ["/designs/totebag/totebag1.jpg", "/designs/totebag/totebag2.jpg", "/designs/totebag/totebag3.jpg"],
  blanket: ["/designs/blanket/blanket1.jpg", "/designs/blanket/blanket2.jpg", "/designs/blanket/blanket3.jpg"],
  earrings: ["/designs/earrings/earrings1.jpg", "/designs/earrings/earrings2.jpg", "/designs/earrings/earrings3.jpg"],
  sofa: ["/designs/sofa/sofa1.jpg", "/designs/sofa/sofa2.jpg", "/designs/sofa/sofa3.jpg"],
  scarf: ["/designs/scarf/scarf1.jpg", "/designs/scarf/scarf2.jpg", "/designs/scarf/scarf3.jpg"],
  backpack: ["/designs/backpack/backpack1.jpg", "/designs/backpack/backpack2.jpg", "/designs/backpack/backpack3.jpg"],
  lamp: ["/designs/lamp/lamp1.jpg", "/designs/lamp/lamp2.jpg", "/designs/lamp/lamp3.jpg"],
  dress: ["/designs/dress/dress1.jpg", "/designs/dress/dress2.jpg", "/designs/dress/dress3.jpg"],
  jean: ["/designs/jean/jean1.jpg", "/designs/jean/jean2.jpg", "/designs/jean/jean3.jpg"],
  plate: ["/designs/plate/plate1.jpg", "/designs/plate/plate2.jpg", "/designs/plate/plate3.jpg"],
  notebook: ["/designs/notebook/notebook1.jpg", "/designs/notebook/notebook2.jpg", "/designs/notebook/notebook3.jpg"],
  shoulderbag: ["/designs/shoulderbag/shoulderbag1.jpg", "/designs/shoulderbag/shoulderbag2.jpg", "/designs/shoulderbag/shoulderbag3.jpg"],
  vase: ["/designs/vase/vase1.jpg", "/designs/vase/vase2.jpg", "/designs/vase/vase3.jpg"],
  toys: ["/designs/toys/toys1.jpg", "/designs/toys/toys2.jpg", "/designs/toys/toys3.jpg"],
  vechile: ["/designs/vechile/vechile1.jpg", "/designs/vechile/vechile2.jpg", "/designs/vechile/vechile3.jpg"],
  glasses: ["/designs/glasses/glasses1.jpg", "/designs/glasses/glasses2.jpg", "/designs/glasses/glasses3.jpg"],
  watches: ["/designs/watches/watches1.jpg", "/designs/watches/watches2.jpg", "/designs/watches/watches3.jpg"],
};

// Product Specific Designs
export const productSpecificDesigns: ProductSpecificDesigns = {
  tshirt: {
    graphic: ["/designs/tshirt/graphic1.jpg", "/designs/tshirt/graphic2.jpg"],
    typography: ["/designs/tshirt/typography1.jpg", "/designs/tshirt/typography2.jpg"],
    vintage: ["/designs/tshirt/vintage1.jpg", "/designs/tshirt/vintage2.jpg"],
    minimal: ["/designs/tshirt/minimal1.jpg", "/designs/tshirt/minimal2.jpg"],
    patterns: ["/designs/shoes/patterns1.jpg", "/designs/shoes/patterns2.jpg"],
    illustrations: ["/designs/shoes/illustrations1.jpg", "/designs/shoes/illustrations2.jpg"],
    custom: ["/designs/shoes/custom1.jpg", "/designs/shoes/custom2.jpg"],
    ecofriendly:["/designs/totebag/eco-friendly1.jpg", "/designs/totebag/eco-friendly2.jpg"],
    bookish: ["/designs/totebag/bookish1.jpg", "/designs/totebag/bookish2.jpg"],
    cute: ["/designs/totebag/cute1.jpg", "/designs/totebag/cute2.jpg"],
    modern: ["/designs/sofa/modern1.jpg", "/designs/sofa/modern2.jpg"],
    chesterfield: ["/designs/sofa/chesterfield1.jpg", "/designs/sofa/chesterfield2.jpg"],
    sectional: ["/designs/sofa/sectional1.jpg", "/designs/sofa/sectional2.jpg"],
  },
  pillow: {
    floral: ["/designs/pillow/floral1.jpg", "/designs/pillow/floral2.jpg"],
    geometric: ["/designs/pillow/geometric1.jpg", "/designs/pillow/geometric2.jpg"],
    abstract: ["/designs/pillow/abstract1.jpg", "/designs/pillow/abstract2.jpg"],
  },
  shoes: {
    patterns: ["/designs/shoes/patterns1.jpg", "/designs/shoes/patterns2.jpg"],
    illustrations: ["/designs/shoes/illustrations1.jpg", "/designs/shoes/illustrations2.jpg"],
    custom: ["/designs/shoes/custom1.jpg", "/designs/shoes/custom2.jpg"],
  },
  phonecase: {
    artistic: ["/designs/phonecase/artistic1.jpg", "/designs/phonecase/artistic2.jpg"],
    photography: ["/designs/phonecase/photography1.jpg", "/designs/phonecase/photography2.jpg"],
    marble: ["/designs/phonecase/marble1.jpg", "/designs/phonecase/marble2.jpg"],
  },
  wallart: {
    nature: ["/designs/wallart/nature1.jpg", "/designs/wallart/nature2.jpg"],
    urban: ["/designs/wallart/urban1.jpg", "/designs/wallart/urban2.jpg"],
    portraits: ["/designs/wallart/portraits1.jpg", "/designs/wallart/portraits2.jpg"],
  },
  hoodie: {
    slogans: ["/designs/hoodie/slogans1.jpg", "/designs/hoodie/slogans2.jpg"],
    bands: ["/designs/hoodie/bands1.jpg", "/designs/hoodie/bands2.jpg"],
    artistic: ["/designs/hoodie/artistic1.jpg", "/designs/hoodie/artistic2.jpg"],
  },
  coffecup: {
    funny: ["/designs/coffecup/funny1.jpg", "/designs/coffecup/funny2.jpg"],
    inspirational: ["/designs/coffecup/inspirational1.jpg", "/designs/coffecup/inspirational2.jpg"],
    minimalist: ["/designs/coffecup/minimalist1.jpg", "/designs/coffecup/minimalist2.jpg"],
  },
  totebag: {
    ecofriendly:["/designs/totebag/eco-friendly1.jpg", "/designs/totebag/eco-friendly2.jpg"],
    bookish: ["/designs/totebag/bookish1.jpg", "/designs/totebag/bookish2.jpg"],
    cute: ["/designs/totebag/cute1.jpg", "/designs/totebag/cute2.jpg"],
  },
  blanket: {
    cozy: ["/designs/blanket/cozy1.jpg", "/designs/blanket/cozy2.jpg"],
    kids: ["/designs/blanket/kids1.jpg", "/designs/blanket/kids2.jpg"],
    holiday: ["/designs/blanket/holiday1.jpg", "/designs/blanket/holiday2.jpg"],
  },
  earrings: {
    bohemian: ["/designs/earrings/bohemian1.jpg", "/designs/earrings/bohemian2.jpg"],
    studs: ["/designs/earrings/studs1.jpg", "/designs/earrings/studs2.jpg"],
    dangle: ["/designs/earrings/dangle1.jpg", "/designs/earrings/dangle2.jpg"],
  },
  sofa: {
    modern: ["/designs/sofa/modern1.jpg", "/designs/sofa/modern2.jpg"],
    chesterfield: ["/designs/sofa/chesterfield1.jpg", "/designs/sofa/chesterfield2.jpg"],
    sectional: ["/designs/sofa/sectional1.jpg", "/designs/sofa/sectional2.jpg"],
  },
  scarf: {
    silk: ["/designs/scarf/silk1.jpg", "/designs/scarf/silk2.jpg"],
    wool: ["/designs/scarf/wool1.jpg", "/designs/scarf/wool2.jpg"],
    infinity: ["/designs/scarf/infinity1.jpg", "/designs/scarf/infinity2.jpg"],
  },
  backpack: {
    hiking: ["/designs/backpack/hiking1.jpg", "/designs/backpack/hiking2.jpg"],
    laptop: ["/designs/backpack/laptop1.jpg", "/designs/backpack/laptop2.jpg"],
    fashion: ["/designs/backpack/fashion1.jpg", "/designs/backpack/fashion2.jpg"],
  },
  lamp: {
    desk: ["/designs/lamp/desk1.jpg", "/designs/lamp/desk2.jpg"],
    floor: ["/designs/lamp/floor1.jpg", "/designs/lamp/floor2.jpg"],
    bedside: ["/designs/lamp/bedside1.jpg", "/designs/lamp/bedside2.jpg"],
  },
  dress: {
    summer: ["/designs/dress/summer1.jpg", "/designs/dress/summer2.jpg"],
    formal: ["/designs/dress/formal1.jpg", "/designs/dress/formal2.jpg"],
    casual: ["/designs/dress/casual1.jpg", "/designs/dress/casual2.jpg"],
  },
  jean: {
    skinny: ["/designs/jean/skinny1.jpg", "/designs/jean/skinny2.jpg"],
    bootcut: ["/designs/jean/bootcut1.jpg", "/designs/jean/bootcut2.jpg"],
    ripped: ["/designs/jean/ripped1.jpg", "/designs/jean/ripped2.jpg"],
  },
  plate: {
    ceramic: ["/designs/plate/ceramic1.jpg", "/designs/plate/ceramic2.jpg"],
    dinner: ["/designs/plate/dinner1.jpg", "/designs/plate/dinner2.jpg"],
    decorative: ["/designs/plate/decorative1.jpg", "/designs/plate/decorative2.jpg"],
  },
  notebook: {
    lined: ["/designs/notebook/lined1.jpg", "/designs/notebook/lined2.jpg"],
    dotted: ["/designs/notebook/dotted1.jpg", "/designs/notebook/dotted2.jpg"],
    planner: ["/designs/notebook/planner1.jpg", "/designs/notebook/planner2.jpg"],
  },
  shoulderbag: {
    leather: ["/designs/shoulderbag/leather1.jpg", "/designs/shoulderbag/leather2.jpg"],
    canvas: ["/designs/shoulderbag/canvas1.jpg", "/designs/shoulderbag/canvas2.jpg"],
    crossbody: ["/designs/shoulderbag/crossbody1.jpg", "/designs/shoulderbag/crossbody2.jpg"],
  },
  vase: {
    glass: ["/designs/vase/glass1.jpg", "/designs/vase/glass2.jpg"],
    ceramic: ["/designs/vase/ceramic1.jpg", "/designs/vase/ceramic2.jpg"],
    bud: ["/designs/vase/bud1.jpg", "/designs/vase/bud2.jpg"],
  },
  toys: {
    plush: ["/designs/toys/plush1.jpg", "/designs/toys/plush2.jpg"],
    wooden: ["/designs/toys/wooden1.jpg", "/designs/toys/wooden2.jpg"],
    educational: ["/designs/toys/educational1.jpg", "/designs/toys/educational2.jpg"],
  },
  vechile: {
    cars: ["/designs/vechile/cars1.jpg", "/designs/vechile/cars2.jpg"],
    bikes: ["/designs/vechile/bikes1.jpg", "/designs/vechile/bikes2.jpg"],
    trucks: ["/designs/vechile/trucks1.jpg", "/designs/vechile/trucks2.jpg"],
  },
  glasses: {
    sunglasses: ["/designs/glasses/sunglasses1.jpg", "/designs/glasses/sunglasses2.jpg"],
    reading: ["/designs/glasses/reading1.jpg", "/designs/glasses/reading2.jpg"],
    "blue-light": ["/designs/glasses/blue-light1.jpg", "/designs/glasses/blue-light2.jpg"],
  },
  watches: {
    classic: ["/designs/watches/classic1.jpg", "/designs/watches/classic2.jpg"],
    sport: ["/designs/watches/sport1.jpg", "/designs/watches/sport2.jpg"],
    smart: ["/designs/watches/smart1.jpg", "/designs/watches/smart2.jpg"],
  },
};

// Default Design Images
export const defaultDesignImages: ProductImages = {
  abstract: ["/defaults/abstract1.jpg", "/defaults/abstract2.jpg"],
  pattern: ["/defaults/pattern1.jpg", "/defaults/pattern2.jpg"],
  geometric: ["/defaults/geometric1.jpg", "/defaults/geometric2.jpg"],
};

// Default Color Images
export const defaultColorImages: ProductImages = {
  warm: ["/defaults/warm1.jpg", "/defaults/warm2.jpg"],
  cool: ["/defaults/cool1.jpg", "/defaults/cool2.jpg"],
  neutral: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
};

// Placeholders
export const defaultPlaceholders: Record<ProductType, string> = {
  tshirt: "/placeholders/tshirt.jpg",
  pillow: "/placeholders/pillow.jpg",
  shoes: "/placeholders/shoes.jpg",
  phonecase: "/placeholders/phonecase.jpg",
  wallart: "/placeholders/wallart.jpg",
  hoodie: "/placeholders/hoodie.jpg",
  coffecup: "/placeholders/coffecup.jpg",
  totebag: "/placeholders/totebag.jpg",
  blanket: "/placeholders/blanket.jpg",
  earrings: "/placeholders/earrings.jpg",
  sofa: "/placeholders/sofa.jpg",
  scarf: "/placeholders/scarf.jpg",
  backpack: "/placeholders/backpack.jpg",
  lamp: "/placeholders/lamp.jpg",
  dress: "/placeholders/dress.jpg",
  jean: "/placeholders/jean.jpg",
  plate: "/placeholders/plate.jpg",
  notebook: "/placeholders/notebook.jpg",
  shoulderbag: "/placeholders/shoulderbag.jpg",
  vase: "/placeholders/vase.jpg",
  toys: "/placeholders/toys.jpg",
  vechile: "/placeholders/vechile.jpg",
  glasses: "/placeholders/glasses.jpg",
  watches: "/placeholders/watches.jpg",
};

export const designPlaceholders: Record<string, string> = {
  graphic: "/placeholders/graphic.jpg",
  typography: "/placeholders/typography.jpg",
  vintage: "/placeholders/vintage.jpg",
  minimal: "/placeholders/minimal.jpg",
  abstract: "/placeholders/abstract.jpg",
  pattern: "/placeholders/pattern.jpg",
  geometric: "/placeholders/geometric.jpg",
  floral: "/placeholders/floral.jpg",
  quotes: "/placeholders/quotes.jpg",
  patterns: "/placeholders/patterns.jpg",
  illustrations: "/placeholders/illustrations.jpg",
  motivational: "/placeholders/motivational.jpg",
  artistic: "/placeholders/artistic.jpg",
  photography: "/placeholders/photography.jpg",
  marble: "/placeholders/marble.jpg",
  nature: "/placeholders/nature.jpg",
  urban: "/placeholders/urban.jpg",
  portraits: "/placeholders/portraits.jpg",
  slogans: "/placeholders/slogans.jpg",
  bands: "/placeholders/bands.jpg",
  funny: "/placeholders/funny.jpg",
  inspirational: "/placeholders/inspirational.jpg",
  minimalist: "/placeholders/minimalist.jpg",
  ecofriendly: "/placeholders/eco-friendly.jpg",
  bookish: "/placeholders/bookish.jpg",
  cute: "/placeholders/cute.jpg",
  cozy: "/placeholders/cozy.jpg",
  kids: "/placeholders/kids.jpg",
  holiday: "/placeholders/holiday.jpg",
  bohemian: "/placeholders/bohemian.jpg",
  studs: "/placeholders/studs.jpg",
  dangle: "/placeholders/dangle.jpg",
  modern: "/placeholders/modern.jpg",
  chesterfield: "/placeholders/chesterfield.jpg",
  sectional: "/placeholders/sectional.jpg",
  silk: "/placeholders/silk.jpg",
  wool: "/placeholders/wool.jpg",
  infinity: "/placeholders/infinity.jpg",
  hiking: "/placeholders/hiking.jpg",
  laptop: "/placeholders/laptop.jpg",
  fashion: "/placeholders/fashion.jpg",
  desk: "/placeholders/desk.jpg",
  floor: "/placeholders/floor.jpg",
  bedside: "/placeholders/bedside.jpg",
  summer: "/placeholders/summer.jpg",
  formal: "/placeholders/formal.jpg",
  casual: "/placeholders/casual.jpg",
  skinny: "/placeholders/skinny.jpg",
  bootcut: "/placeholders/bootcut.jpg",
  ripped: "/placeholders/ripped.jpg",
  ceramic: "/placeholders/ceramic.jpg",
  dinner: "/placeholders/dinner.jpg",
  decorative: "/placeholders/decorative.jpg",
  lined: "/placeholders/lined.jpg",
  dotted: "/placeholders/dotted.jpg",
  planner: "/placeholders/planner.jpg",
  leather: "/placeholders/leather.jpg",
  canvas: "/placeholders/canvas.jpg",
  crossbody: "/placeholders/crossbody.jpg",
  glass: "/placeholders/glass.jpg",
  bud: "/placeholders/bud.jpg",
  plush: "/placeholders/plush.jpg",
  wooden: "/placeholders/wooden.jpg",
  educational: "/placeholders/educational.jpg",
  cars: "/placeholders/cars.jpg",
  bikes: "/placeholders/bikes.jpg",
  trucks: "/placeholders/trucks.jpg",
  sunglasses: "/placeholders/sunglasses.jpg",
  reading: "/placeholders/reading.jpg",
  bluelight: "/placeholders/blue-light.jpg",
  classic: "/placeholders/classic.jpg",
  sport: "/placeholders/sport.jpg",
  smart: "/placeholders/smart.jpg",
  custom: "/placeholders/custom.jpg",
};

export const colorPlaceholders: Record<string, string> = {
  warm: "/placeholders/warm.jpg",
  cool: "/placeholders/cool.jpg",
  neutral: "/placeholders/neutral.jpg",
};