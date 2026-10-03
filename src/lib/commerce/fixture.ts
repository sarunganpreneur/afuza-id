export const DPF_COMMERCE_FIXTURE_V1 = {
  product: {
    id: "d0f00000-0000-4000-8000-000000000001",
    sku: "AFZ-SPR-HPP-001",
    slug: "kalkulator-hpp-harga-jual-umkm",
    title: "Kalkulator HPP & Harga Jual UMKM",
    price: 19000,
    status: "PUBLISHED",
  },
  addons: [
    { id: "d0f00000-0000-4000-8000-000000000011", title: "Pembukuan Usaha", price: 19000, active: true, sortOrder: 1 },
    { id: "d0f00000-0000-4000-8000-000000000012", title: "Inventory Tracker", price: 15000, active: true, sortOrder: 2 },
  ],
} as const;