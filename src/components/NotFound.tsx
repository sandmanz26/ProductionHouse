import { Button } from "@heroui/react";
import { useNavigate } from "react-router";
import { EmptyBlock } from "./ui";

/** Shown when a detail route points at a record that no longer exists. */
export function RecordNotFound({ what, back }: { what: string; back: string }) {
  const navigate = useNavigate();
  return (
    <EmptyBlock
      title={`${what} not found`}
      description="The record may have been deleted, or the link is not valid."
      action={<Button onPress={() => navigate(back)}>Back</Button>}
    />
  );
}
