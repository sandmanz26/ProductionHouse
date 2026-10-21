import { Button } from "@heroui/react";
import { useNavigate } from "react-router";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-semibold text-muted">404</p>
      <h1 className="mt-3 text-lg font-semibold">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm text-muted">Tautan mungkin sudah usang atau datanya telah dihapus.</p>
      <Button className="mt-6" onPress={() => navigate("/")}>
        Kembali ke beranda
      </Button>
    </div>
  );
}
