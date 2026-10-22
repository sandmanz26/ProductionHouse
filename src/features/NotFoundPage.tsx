import { BrandedState } from "@/components/BrandedState";

export default function NotFoundPage() {
  return (
    <BrandedState
      code="404"
      title="Halaman ini tidak ada di buku kerja."
      body="Tautannya mungkin salah ketik, atau datanya sudah dihapus."
    />
  );
}
