// Types
export type ProductType = "tshirt" | "pillow" | "shoes" | "phonecase" | "wallart" | "hoodie" | "coffecup" | "totebag" | "blanket" | "earrings" | "sofa" | "scarf" | "backpack" | "lamp" | "dress" | "jean" | "plate" | "notebook" | "shoulderbag" | "vase" | "toys" | "vehicles" | "glasses" | "watches" ;

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
  vehicles: ["/designs/vechile/vechile1.jpg", "/designs/vechile/vechile2.jpg", "/designs/vechile/vechile3.jpg"],
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
  neutral: ["/inputs/placeholders/colors/neutral.webp"],
  pastel: ["/inputs/placeholders/colors/pastel.webp"],
  fall: ["/inputs/placeholders/colors/fall.webp"],
  earth: ["/inputs/placeholders/colors/earth.webp"],
  romantic: ["/inputs/placeholders/colors/romantic.webp"],
  warm: ["/inputs/placeholders/colors/warm.webp"],
  moody: ["/inputs/placeholders/colors/moody.webp"],
  cool: ["/inputs/placeholders/colors/cool.webp"],
  contemprory: ["/inputs/placeholders/colors/contemprory.webp"],
  vintage: ["/inputs/placeholders/colors/vintage.webp"],
  spring: ["/inputs/placeholders/colors/spring.webp"],
  vibrant: ["/inputs/placeholders/colors/vibrant.webp"],
  winter: ["/inputs/placeholders/colors/winter.webp"],
  jewel: ["/inputs/placeholders/colors/jewel.webp"],
  summer: ["/inputs/placeholders/colors/summer.webp"],
  cyberpunk: ["/inputs/placeholders/colors/cyberpunk.webp"],
  tropical: ["/inputs/placeholders/colors/tropical.webp"],
  analogous: ["/inputs/placeholders/colors/analogous.webp"],
  neon: ["/inputs/placeholders/colors/neon.webp"],
};


//Default Product Placeholders
export const defaultPlaceholders: Record<ProductType, string> = {
  tshirt: "inputs/placeholders/t-shirt.svg",
  pillow: "inputs/placeholders/pillow.svg",
  shoes: "inputs/placeholders/shoes.svg",
  phonecase: "inputs/placeholders/phonecase.svg",
  wallart: "inputs/placeholders/wallart.svg",
  hoodie: "inputs/placeholders/hoodie.svg",
  coffecup: "inputs/placeholders/coffeecup.svg",
  totebag: "inputs/placeholders/totebag.svg",
  blanket: "inputs/placeholders/blanket.svg",
  earrings: "inputs/placeholders/earrings.svg",
  sofa: "inputs/placeholders/sofa.svg",
  scarf: "inputs/placeholders/scarf.svg",
  backpack: "inputs/placeholders/backpack.svg",
  lamp: "inputs/placeholders/lamp.svg",
  dress: "inputs/placeholders/dress.svg",
  jean: "inputs/placeholders/jean.svg",
  plate: "inputs/placeholders/plate.svg",
  notebook: "inputs/placeholders/notebook.svg",
  shoulderbag: "inputs/placeholders/shoulderbag.svg",
  vase: "inputs/placeholders/vase.svg",
  toys: "inputs/placeholders/toys.svg",
  vehicles: "inputs/placeholders/vehicles.svg",
  glasses: "inputs/placeholders/glasses.svg",
  watches: "inputs/placeholders/watches.svg",
};

// Design Placeholder
export const designPlaceholders: Record<string, string> = {
  minimalsleek: "/inputs/placeholders/bags/minimalsleeksophisticated.webp",
  animeinspired: "/inputs/placeholders/general/animeinspired.webp",
  undersun: "/inputs/placeholders/general/underthesun.webp",
  quiteluxury: "/inputs/placeholders/bags/quietluxury.webp",
  artistic: "/inputs/placeholders/general/artistic.webp",
  bold: "/inputs/placeholders/general/bold.webp",
  eclectictraveler: "/inputs/placeholders/officesupplies/eclectic traveller.webp",
  futuristic: "/inputs/placeholders/general/futuristic.webp",
  traditonaljapanese: "/inputs/placeholders/general/traditionaljapanese.webp",
  romantic: "/inputs/placeholders/general/printseclectictraveler.webp",
  mystical: "/inputs/placeholders/general/mystical.webp",
  sportysleek: "/inputs/placeholders/general/sportysleek.webp",
  funcoolquriky: "/inputs/placeholders/general/funcoolquriky.webp",
  essentail: "/inputs/placeholders/general/essential.webp",
  vintagefeel: "/inputs/placeholders/fashion/vintage feel.webp",
  abstractpattern: "/inputs/placeholders/general/abstractpattern.webp",
  colorpop: "/inputs/placeholders/bags/colorpop.webp",
  animalprint: "/inputs/placeholders/general/animalprint.webp",
  romanticsoft: "/inputs/placeholders/general/romanticsoft.webp",
  tropicaltimes: "/inputs/placeholders/general/tropicaltimes.webp",
  timeless: "/inputs/placeholders/general/timeless.webp",
  seventy: "/inputs/placeholders/general/seventy.webp",
  luxury: "/inputs/placeholders/general/luxury.webp",
};

// Color Placeholder
export const colorPlaceholders: Record<string, string> = {
  neutral: "/inputs/placeholders/colors/neutral.webp",
  pastel: "/inputs/placeholders/colors/pastel.webp",
  fall: "/inputs/placeholders/colors/fall.webp",
  earth: "/inputs/placeholders/colors/earth.webp",
  romantic: "/inputs/placeholders/colors/romantic.webp",
  warm: "/inputs/placeholders/colors/warm.webp",
  moody: "/inputs/placeholders/colors/moody.webp",
  cool: "/inputs/placeholders/colors/cool.webp",
  contemprory: "/inputs/placeholders/colors/contemprory.webp",
  vintage: "/inputs/placeholders/colors/vintage.webp",
  spring: "/inputs/placeholders/colors/spring.webp",
  vibrant: "/inputs/placeholders/colors/vibrant.webp",
  winter: "/inputs/placeholders/colors/winter.webp",
  jewel:"/inputs/placeholders/colors/jewel.webp",
  summer: "/inputs/placeholders/colors/summer.webp",
  cyberpunk: "/inputs/placeholders/colors/cyberpunk.webp",
  tropical: "/inputs/placeholders/colors/tropical.webp",
  analogous: "/inputs/placeholders/colors/analogous.webp",
  neon: "/inputs/placeholders/colors/neon.webp",  
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
  vehicles: {
   
  },
  glasses: {
    
  },
  watches: {
    
  },
};

// Product Labels (supports HTML tags like <br>)
export const productLabels: Record<ProductType, string> = {
  tshirt: "T-Shirt",
  pillow: "Pillow",
  shoes: "Shoes",
  phonecase: "Phone<br>Case",
  wallart: "Wall<br>Art",
  hoodie: "Hoodie",
  coffecup: "Coffee<br>Cup",
  totebag: "Tote<br>Bag",
  blanket: "Blanket",
  earrings: "Earrings",
  sofa: "Sofa",
  scarf: "Scarf",
  backpack: "Back<br>Pack",
  lamp: "Lamp",
  dress: "Dress",
  jean: "Jean",
  plate: "Plate",
  notebook: "Note<br>Book",
  shoulderbag: "Shoulder<br>Bag",
  vase: "Vase",
  toys: "Toys",
  vehicles: "Vehicles",
  glasses: "Glasses",
  watches: "Watches",
};

// Design Labels (supports HTML tags like <br>)
export const designLabels: Record<string, string> = {
  minimalsleek: "Minimal<br>Sleek",
  animeinspired: "Anime<br>Inspired",
  undersun: "Under<br>Sun",
  quiteluxury: "Quiet<br>Luxury",
  artistic: "Artistic",
  bold: "Bold",
  eclectictraveler: "Eclectic<br>Traveler",
  futuristic: "Futuristic",
  traditonaljapanese: "Traditional<br>Japanese",
  romantic: "Romantic",
  mystical: "Mystical",
  sportysleek: "Sporty<br>Sleek",
  funcoolquriky: "Fun Cool<br>Quirky",
  essentail: "Essential",
  vintagefeel: "Vintage<br>Feel",
  abstractpattern: "Abstract<br>Pattern",
  colorpop: "Color<br>Pop",
  animalprint: "Animal<br>Print",
  romanticsoft: "Romantic<br>Soft",
  tropicaltimes: "Tropical<br>Times",
  timeless: "Timeless",
  seventy: "Seventy",
  luxury: "Luxury",
};

// Color Labels (supports HTML tags like <br>)
export const colorLabels: Record<string, string> = {
  neutral: "Neutral",
  pastel: "Pastel",
  fall: "Fall",
  earth: "Earth",
  romantic: "Romantic",
  warm: "Warm",
  moody: "Moody",
  cool: "Cool",
  contemprory: "Contemporary",
  vintage: "Vintage",
  spring: "Spring",
  vibrant: "Vibrant",
  winter: "Winter",
  jewel: "Jewel",
  summer: "Summer",
  cyberpunk: "Cyber<br>Punk",
  tropical: "Tropical",
  analogous: "Analogous",
  neon: "Neon",
};