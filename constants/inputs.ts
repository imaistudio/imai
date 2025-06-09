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

// Default Product Images
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

// Default Design Images
export const defaultDesignImages: ProductImages = {
  minimalsleek: ["/defaults/abstract1.jpg", "/defaults/abstract2.jpg"],
  animeinspired: ["/defaults/pattern1.jpg", "/defaults/pattern2.jpg"],
  undersun: ["/defaults/geometric1.jpg", "/defaults/geometric2.jpg"],
  quiteluxury: ["/defaults/warm1.jpg", "/defaults/warm2.jpg"],
  artistic: ["/defaults/cool1.jpg", "/defaults/cool2.jpg"],
  bold: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  eclectictraveler: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  futuristic: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  traditonaljapanese: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  romantic: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  mystical: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  sportysleek: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  funcoolquriky: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  essentail: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  vintagefeel: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  abstractpattern: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  colorpop: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  animalprint: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  romanticsoft: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  tropicaltimes: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  timeless: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  seventy: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
  luxury: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
};

// Default Color Images
export const defaultColorImages: ProductImages = {
  neutral: ["/defaults/warm1.jpg"],
  pastal: ["/defaults/warm1.jpg"],
  fall: ["/defaults/warm1.jpg"],
  earth: ["/defaults/warm1.jpg"],
  romantic: ["/defaults/warm1.jpg"],
  warm: ["/defaults/warm1.jpg"],
  moody: ["/defaults/warm1.jpg"],
  cool: ["/defaults/warm1.jpg"],
  contemporary: ["/defaults/warm1.jpg"],
  vintage: ["/defaults/warm1.jpg"],
  spring: ["/defaults/warm1.jpg"],
  vibrant: ["/defaults/warm1.jpg"],
  winter: ["/defaults/warm1.jpg"],
  jewel: ["/defaults/warm1.jpg"],
  summer: ["/defaults/warm1.jpg"],
  cyberpunk: ["/defaults/warm1.jpg"],
  tropical: ["/defaults/warm1.jpg"],
  analgous: ["/defaults/warm1.jpg"],
  neon: ["/defaults/warm1.jpg"],
};


//Default Product Placeholders
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

// Design Placeholder
export const designPlaceholders: Record<string, string> = {
  minimalsleek: "/placeholders/minimalsleek.jpg",
  animeinspired: "/placeholders/animeinspired.jpg",
  undersun: "/placeholders/undersun.jpg",
  quiteluxury: "/placeholders/quiteluxury.jpg",
  artistic: "/placeholders/artistic.jpg",
  bold: "/placeholders/bold.jpg",
  eclectictraveler: "/placeholders/eclectictraveler.jpg",
  futuristic: "/placeholders/futuristic.jpg",
  traditonaljapanese: "/placeholders/traditonaljapanese.jpg",
  romantic: "/placeholders/romantic.jpg",
  mystical: "/placeholders/mystical.jpg",
  sportysleek: "/placeholders/sportysleek.jpg",
  funcoolquriky: "/placeholders/funcoolquriky.jpg",
  essentail: "/placeholders/essentail.jpg",
  vintagefeel: "/placeholders/vintagefeel.jpg",
  abstractpattern: "/placeholders/abstractpattern.jpg",
  colorpop: "/placeholders/colorpop.jpg",
  animalprint: "/placeholders/animalprint.jpg",
  romanticsoft: "/placeholders/romanticsoft.jpg",
  tropicaltimes: "/placeholders/tropicaltimes.jpg",
  timeless: "/placeholders/timeless.jpg",
  seventy: "/placeholders/seventy.jpg",
  luxury: "/placeholders/luxury.jpg",
};

// Color Placeholder
export const colorPlaceholders: Record<string, string> = {
  neutral: "/placeholders/warm.jpg",
  pastal: "/placeholders/cool.jpg",
  fall: "/placeholders/neutral.jpg",
  earth: "/placeholders/neutral.jpg",
  romantic: "/placeholders/neutral.jpg",
  warm: "/placeholders/neutral.jpg",
  moody: "/placeholders/neutral.jpg",
  cool: "/placeholders/neutral.jpg",
  contemporary: "/placeholders/neutral.jpg",
  vintage: "/placeholders/neutral.jpg",
  spring: "/placeholders/neutral.jpg",
  vibrant: "/placeholders/neutral.jpg",
  winter: "/placeholders/neutral.jpg",
  summer: "/placeholders/neutral.jpg",
  cyberpunk: "/placeholders/neutral.jpg",
  tropical: "/placeholders/neutral.jpg",
  analgous: "/placeholders/neutral.jpg",
  neon: "/placeholders/neutral.jpg",  
};



// Product Specific Designs
export const productSpecificDesigns: ProductSpecificDesigns = {
  tshirt: {
    // test: ["/designs/tshirt/graphic1.jpg", "/designs/tshirt/graphic2.jpg"],
    // test2: ["/designs/tshirt/typography1.jpg", "/designs/tshirt/typography2.jpg"],
    // test3: ["/designs/tshirt/vintage1.jpg", "/designs/tshirt/vintage2.jpg"],
  },
  pillow: {
    
  },
  shoes: {
    
  },
  phonecase: {
   
  },
  wallart: {
    
  },
  hoodie: {
    
  },
  coffecup: {
    
  },
  totebag: {
   
  },
  blanket: {
   
  },
  earrings: {
    
  },
  sofa: {
    
  },
  scarf: {
    
  },
  backpack: {
    
  },
  lamp: {
    
  },
  dress: {
    
  },
  jean: {
    
  },
  plate: {
    
  },
  notebook: {
    
  },
  shoulderbag: {
    
  },
  vase: {
    
  },
  toys: {
    
  },
  vechile: {
   
  },
  glasses: {
    
  },
  watches: {
    
  },
};