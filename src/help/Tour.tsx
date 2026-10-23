import { Button, Modal } from "@heroui/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { BRAND } from "@/brand/brand";
import { FlowSteps } from "./FlowSteps";
import type { FlowStep } from "./content";
import { useHelp } from "./help-store";

interface TourStep {
  eyebrow: string;
  title: string;
  body: string;
  flow?: FlowStep[];
  note?: string;
}

const STEPS: TourStep[] = [
  {
    eyebrow: "Welcome",
    title: `${BRAND.name} follows every piece of timber from purchase to payment`,
    body: "It is one workbook for the whole workshop: what you buy, what is in stock, what is on the floor, what you sell or rent out, and who still owes whom. This tour takes a minute; you can reopen it any time from Help.",
    flow: [
      { label: "Buy", sub: "purchase orders", kind: "money" },
      { label: "Stock", sub: "kept in lots", kind: "material" },
      { label: "Make", sub: "work orders", kind: "process" },
      { label: "Sell or rent", sub: "sales, rentals", kind: "product" },
      { label: "Get paid", sub: "receivables", kind: "money" },
    ],
  },
  {
    eyebrow: "1 · Stock in lots",
    title: "Everything in stock is a lot with its own price",
    body: "Receiving a purchase creates a lot — e.g. 1.2 m³ of teak at Rp 14,500,000/m³ including freight. When material leaves, Serat knows exactly which lot it came from and what it cost.",
    flow: [
      { label: "Purchase order", sub: "supplier, price, freight", kind: "money" },
      { label: "Receive", sub: "full or partial", kind: "process" },
      { label: "New lot", sub: "qty × unit cost", kind: "material" },
    ],
    note: "Stock → Materials and Products show every lot. Open one to trace where it came from and where it went.",
  },
  {
    eyebrow: "2 · Work orders",
    title: "A work order turns materials into products — and locks the cost",
    body: "Issue materials to the job, log labour, move it through its stages on the board, then complete it. The job cost is materials + labour + overhead, minus the offcuts you put back.",
    flow: [
      { label: "Plan", sub: "BOM or recipe", kind: "process" },
      { label: "Issue", sub: "offcuts first", kind: "material" },
      { label: "Labour & stages", sub: "production board", kind: "process" },
      { label: "Complete", sub: "products + offcuts", kind: "product" },
      { label: "Cost locked", sub: "per unit", kind: "money" },
    ],
  },
  {
    eyebrow: "3 · Offcuts",
    title: "Every offcut has a price",
    body: "Usable leftovers go back to stock with their size and their share of the cost, so the job is not charged for them and the next job uses them first. Waste you sell (sawdust, scrap) lowers the job cost.",
    flow: [
      { label: "Work order", sub: "cut 2 m board", kind: "process" },
      { label: "Offcut lot", sub: "600 mm, own price", kind: "offcut" },
      { label: "Next job", sub: "suggested first", kind: "process" },
    ],
  },
  {
    eyebrow: "4 · Selling, renting, getting paid",
    title: "Shipping takes the real cost out of stock",
    body: "A sales order ships specific lots, so the margin is real. Rentals keep units on your books while they are out; damaged returns go to a repair work order. Unpaid balances show up in Receivables & payables.",
    flow: [
      { label: "Sales order", sub: "down payment", kind: "product" },
      { label: "Ship", sub: "COGS from lots", kind: "material" },
      { label: "Invoice", sub: "receivable", kind: "money" },
      { label: "Paid", sub: "balance zero", kind: "money" },
    ],
  },
  {
    eyebrow: "Finding your way",
    title: "Help is always one click away",
    body: "Every page has a How this works button at the top: what the page is for, a picture of its flow, step-by-step tasks and what it changes elsewhere. The Help page has the full map of the workshop and a glossary. Press Ctrl K (⌘K) to jump to any code or item.",
  },
];

export function Tour() {
  const isOpen = useHelp((s) => s.tourOpen);
  const close = useHelp((s) => s.closeTour);
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <Modal.Container size="lg" placement="center">
        <Modal.Dialog aria-label="Introduction to Serat">{isOpen && <TourBody onClose={close} />}</Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function TourBody({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  return (
    <div className="flex flex-col gap-4 p-1">
      <div>
        <p className="eyebrow">
          {step.eyebrow} <span className="num ml-1 text-muted">{i + 1}/{STEPS.length}</span>
        </p>
        <h2 className="mt-1 text-lg leading-snug font-semibold">{step.title}</h2>
      </div>
      <p className="text-[14px] leading-relaxed text-foreground/85">{step.body}</p>
      {step.flow && <FlowSteps steps={step.flow} note={step.note} compact />}
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((_, k) => (
          <span key={k} className={`h-1 flex-1 rounded-full ${k <= i ? "bg-accent" : "bg-default"}`} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onPress={onClose}>
          Skip tour
        </Button>
        <div className="flex gap-2">
          {i > 0 && (
            <Button variant="tertiary" size="sm" onPress={() => setI(i - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          )}
          {last ? (
            <>
              <Button
                variant="tertiary"
                size="sm"
                onPress={() => {
                  onClose();
                  navigate("/help");
                }}
              >
                Open Help
              </Button>
              <Button variant="primary" size="sm" onPress={onClose}>
                Start working
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onPress={() => setI(i + 1)}>
              Next <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
