import { Button } from "@heroui/react";
import { useNavigate } from "react-router";
import { EmptyBlock } from "./ui";

/** Shown when a detail route points at a record that no longer exists. */
export function RecordNotFound({ what, back }: { what: string; back: string }) {
  const navigate = useNavigate();
  return (
    <EmptyBlock
      title={`${what} tidak ditemukan`}
      description="Data mungkin sudah dihapus atau tautan tidak valid."
      action={<Button onPress={() => navigate(back)}>Kembali</Button>}
    />
  );
}
