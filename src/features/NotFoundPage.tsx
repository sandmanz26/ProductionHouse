import { BrandedState } from "@/components/BrandedState";

export default function NotFoundPage() {
  return (
    <BrandedState
      code="404"
      title="This page is not in the workbook."
      body="The link may have a typo, or the record has been deleted."
    />
  );
}
