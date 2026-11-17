// Data produk (dipakai halaman toko, Customer Experience Review, dan validasi server).
export const BUNS_FLAVORS = ["Butter", "Coklat", "Vanilla", "Raspberry", "Peach Cream", "Matcha", "Pine Poop"];

export const PRODUCTS = {
  buns: [
    { id: "b1", name: "Tarobun Butter (OG)",   price: 13000, desc: "Roti lembut dengan krim mentega klasik yang kaya.",                                      img: "/products/butter.webp", soldOut: false },
    { id: "b2", name: "Tarobun Chocolate",      price: 16000, desc: "Isian krim cokelat yang manis, halus, dan pekat.",                                       img: "/products/chocolate.webp", soldOut: false },
    { id: "b3", name: "Tarobun Vanilla",        price: 16000, desc: "Krim vanila klasik yang lembut dan nyaman di lidah.",                                    img: "/products/vanilla.webp", soldOut: false },
    { id: "b4", name: "Tarobun Peach Cream",    price: 17000, desc: "Krim buah peach yang juicy dan segar.",                                                  img: "/products/peach-cream.webp", soldOut: false },
    { id: "b5", name: "Tarobun Raspberry",      price: 17000, desc: "Krim raspberry manis dengan sedikit asam yang menyegarkan.",                             img: "/products/raspberry.webp", soldOut: false },
    { id: "b6", name: "Tarobun Matcha",      price: 16000, desc: "Dibuat dari premium matcha powder yang bikin mood kamu auto naik.",                            img: "/products/matcha.webp", soldOut: false },
    { id: "b7", name: "Tarobun Lemon (Mascarpone)", price: 17000, desc: "Krim lemon mascarpone yang creamy dengan sentuhan asam segar.",                       img: null /* taruh foto di /products/lemon-mascarpone.webp lalu ganti null */, soldOut: true },
  ],
  packs: [
    { id: "p1", name: "Family Pack Custom",    price: 88000, desc: "Pilih 6 rasa sesukamu! Kombinasi bebas dari semua varian.", custom: true,                 img: "/products/family-pack-custom.webp", soldOut: false },
    { id: "p2", name: "Family Pack VanCok",    price: 88000, desc: "Isi fix: 3 Vanilla + 3 Coklat. Pasangan sempurna yang tak pernah gagal.", fix: "3 Vanilla + 3 Coklat",    img: "/products/family-pack-vancok.webp", soldOut: false },
    { id: "p3", name: "Family Pack BuVanCok",  price: 88000, desc: "Isi fix: 2 Butter + 2 Vanilla + 2 Coklat. Trio klasik dalam satu box.", fix: "2 Butter + 2 Vanilla + 2 Coklat", img: "/products/family-pack-buvancok.webp", soldOut: false },
  ],
  drinks: [
    { id: "d1", name: "Taro Latte Original",           price: 22000, desc: "Minuman susu creamy dengan rasa taro khas Tarobun yang pekat dan manis pas.",                                              img: "/products/tarolatte-original.webp", soldOut: false },
    { id: "d2", name: "Taro Latte Blueberry",          price: 25000, desc: "Perpaduan taro latte creamy dengan tambahan blueberry manis dan sedikit asam.",                                            img: "/products/tarolatte-blueberry.webp", soldOut: false },
    { id: "d3", name: "Taro Latte Strawberry Cheese",  price: 25000, desc: "Varian favorit: taro latte dengan keju dan stroberi — creamy, milky, manis, gurih, ada sensasi sedikit asin.",            img: "/products/tarolatte-strawberry-cheese.webp", soldOut: false },
  ],
};
