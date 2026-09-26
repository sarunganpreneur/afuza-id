"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthPath } from "@/lib/auth/routing";
import { normalizePostAuthReturnTo } from "@/lib/auth/return-to";

export type RegisterFormState = {
  fieldErrors?: Partial<Record<"full_name" | "email" | "whatsapp" | "password" | "confirm_password", string>>;
  formError?: string;
};

export type LoginFormState = {
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  formError?: string;
};

export type ForgotPasswordFormState = {
  fieldError?: string;
  submitted?: boolean;
};

export type ResetPasswordFormState = {
  fieldErrors?: Partial<Record<"password" | "confirm_password", string>>;
  formError?: string;
};

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function normalizeWhatsapp(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "").replace(/^\+/, "");

  if (/^08\d{8,13}$/.test(compact)) return `62${compact.slice(1)}`;
  if (/^628\d{8,13}$/.test(compact)) return compact;
  return null;
}

export async function register(
  _previousState: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const fullName = readText(formData, "full_name").trim();
  const email = readText(formData, "email").trim().toLowerCase();
  const whatsapp = normalizeWhatsapp(readText(formData, "whatsapp"));
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirm_password");
  const fieldErrors: RegisterFormState["fieldErrors"] = {};

  if (fullName.length < 2 || fullName.length > 120) {
    fieldErrors.full_name = "Masukkan nama lengkap antara 2 sampai 120 karakter.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    fieldErrors.email = "Masukkan alamat email yang valid.";
  }
  if (!whatsapp) fieldErrors.whatsapp = "Masukkan nomor WhatsApp Indonesia yang valid.";
  if (password.length < 8) fieldErrors.password = "Password minimal terdiri dari 8 karakter.";
  if (password !== confirmPassword) fieldErrors.confirm_password = "Konfirmasi password harus sama.";

  if (Object.keys(fieldErrors).length > 0 || !whatsapp) return { fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, whatsapp } },
  });

  if (error) return { formError: "Pendaftaran belum berhasil. Periksa data Anda dan coba lagi." };

  if (data?.session && data.user) {
    const destination = await getPostAuthPath(supabase, data.user);
    if (destination === "/dashboard") redirect("/dashboard");
  }

  redirect("/verify-email");
}

export async function login(
  _previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = readText(formData, "email").trim().toLowerCase();
  const password = readText(formData, "password");

  const returnTo =
    normalizePostAuthReturnTo(
      readText(
        formData,
        "next",
      ),
    );

  const fieldErrors: LoginFormState["fieldErrors"] = {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    fieldErrors.email = "Masukkan alamat email yang valid.";
  }
  if (!password) fieldErrors.password = "Masukkan password Anda.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) return { formError: "Email atau password tidak sesuai." };

  const destination =
    await getPostAuthPath(
      supabase,
      data.user,
    );

  /*
   * Never allow return-to to bypass
   * email / phone / account eligibility.
   */
  redirect(
    destination === "/dashboard" &&
    returnTo
      ? returnTo
      : destination,
  );
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _previousState: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const email = readText(formData, "email").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { fieldError: "Masukkan alamat email yang valid." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);
  return { submitted: true };
}

export async function resetPassword(
  _previousState: ResetPasswordFormState,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirm_password");
  const fieldErrors: ResetPasswordFormState["fieldErrors"] = {};

  if (password.length < 8) fieldErrors.password = "Password minimal terdiri dari 8 karakter.";
  if (password !== confirmPassword) fieldErrors.confirm_password = "Konfirmasi password harus sama.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { formError: "Sesi reset password tidak valid atau sudah berakhir." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { formError: "Password belum berhasil diperbarui. Silakan coba lagi." };

  await supabase.auth.signOut();
  redirect("/login?reset=success");
}