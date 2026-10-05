import { MASTER_DEFINITIONS } from "@/lib/dpf/product-factory/launch-batch-01";
import type { MasterCode, MasterSpec } from "./types";

export const GENERATOR_VERSION = "1.0.0";

export const MASTER_SPECS: Record<MasterCode, MasterSpec> = {
  HPP: {
    code: "HPP", name: "Kalkulator HPP & Harga Jual", priceIdr: 19000,
    formats: ["xlsx", "pdf"],
    sheets: ["Profil Usaha", "Kalkulator", "Bahan & Biaya", "Simulasi", "Contoh Niche", "Panduan"],
    formulas: ["biaya bahan", "HPP per unit", "harga jual rekomendasi", "markup", "profit per unit", "break-even"],
    modules: ["profil usaha", "bahan dan biaya", "tenaga kerja", "overhead", "waste/loss", "margin", "titik impas"],
    qaTerms: ["HPP per unit", "Harga jual rekomendasi", "Titik impas", "margin target"],
  },
  BOOK: {
    code: "BOOK", name: "Pembukuan Usaha", priceIdr: 29000,
    formats: ["xlsx", "pdf"],
    sheets: ["Setup Usaha", "Transaksi", "Ringkasan Bulanan", "Laba Rugi", "Dasbor", "Panduan"],
    formulas: ["SUMIFS pemasukan", "SUMIFS pengeluaran", "laba bersih", "saldo kas", "piutang", "utang"],
    modules: ["setup usaha", "pemasukan", "pengeluaran", "kategori", "kas", "piutang", "utang", "ringkasan bulanan"],
    qaTerms: ["Transaksi", "Pemasukan", "Pengeluaran", "Laba bersih"],
  },
  INV: {
    code: "INV", name: "Inventory Tracker", priceIdr: 25000,
    formats: ["xlsx", "pdf"],
    sheets: ["Daftar Barang", "Mutasi Stok", "Ringkasan Stok", "Dasbor", "Panduan"],
    formulas: ["stok masuk", "stok keluar", "stok saat ini", "nilai persediaan", "peringatan stok minimum"],
    modules: ["master barang", "supplier", "stok awal", "barang masuk", "barang keluar", "harga beli", "reorder"],
    qaTerms: ["Stok saat ini", "Stok minimum", "Peringatan pembelian ulang", "Nilai persediaan"],
  },
  ADMIN: {
    code: "ADMIN", name: "Business Administration Kit", priceIdr: 29000,
    formats: ["xlsx", "docx", "pdf"],
    sheets: ["Pelanggan", "Pemasok", "Penawaran", "Pesanan", "Nomor Dokumen", "Checklist", "Panduan"],
    formulas: [],
    modules: ["database pelanggan", "database pemasok", "penawaran", "pesanan", "invoice", "penerimaan", "beban", "pembayaran", "penomoran dokumen"],
    qaTerms: ["Penawaran", "Invoice", "Penerimaan barang/jasa", "Catatan pembayaran"],
  },
  MKT: {
    code: "MKT", name: "Marketing Kit", priceIdr: 39000,
    formats: ["xlsx", "docx", "pdf"],
    sheets: ["Persona", "Penawaran", "USP", "Kalender 30 Hari", "Bank Hook CTA", "Promo", "Campaign", "KPI", "Panduan"],
    formulas: ["rasio konversi", "biaya per prospek", "nilai pesanan rata-rata", "ROAS"],
    modules: ["persona", "penawaran", "USP", "perencana konten", "hook", "CTA", "kalender promo", "pelacakan campaign", "KPI"],
    qaTerms: ["persona", "penawaran", "kalender 30 hari", "rasio konversi"],
  },
};

export const SOURCE_MASTER_BY_CODE = new Map(MASTER_DEFINITIONS.map((master) => [master.masterCode as MasterCode, master]));

export const MASTER_COUNT = Object.keys(MASTER_SPECS).length;