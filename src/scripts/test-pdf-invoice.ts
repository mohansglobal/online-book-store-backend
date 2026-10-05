import { generateOrderInvoicePdf } from "../services/pdf-invoice.service.js";
import type { OrderConfirmationEmailJobPayload } from "../types/queue.types.js";

async function runPdfInvoiceTest() {
  console.log("=== PDF Invoice Generator Verification ===");

  const sampleOrderData: OrderConfirmationEmailJobPayload = {
    toEmail: "test_invoice_buyer@example.com",
    buyerName: "test_buyer_john_doe",
    orderNumber: "TEST-ORD-2026-9999",
    orderId: "64f8a1234567890abcdef123",
    items: [
      {
        title: "test_book_the_clean_coder",
        quantity: 2,
        priceInPaise: 45000, // Rs. 450.00
        subtotalInPaise: 90000, // Rs. 900.00
      },
      {
        title: "test_book_design_patterns",
        quantity: 1,
        priceInPaise: 65000, // Rs. 650.00
        subtotalInPaise: 65000, // Rs. 650.00
      },
    ],
    subtotalInPaise: 155000, // Rs. 1550.00
    deliveryChargeInPaise: 5000, // Rs. 50.00
    couponDiscountInPaise: 15000, // Rs. 150.00
    totalAmountInPaise: 145000, // Rs. 1450.00
    paymentMethod: "ONLINE_PAY",
    shippingAddress: {
      fullName: "test_buyer_john_doe",
      streetAddress: "123 Test Street, Suite 4",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India",
      mobileNumber: "+919876543210",
    },
  };

  try {
    console.log("Generating PDF invoice buffer...");
    const pdfBuffer = await generateOrderInvoicePdf(sampleOrderData);

    console.log("PDF generated successfully!");
    console.log("PDF Buffer size (bytes):", pdfBuffer.length);
    const pageMatches = pdfBuffer.toString("latin1").match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 0;
    console.log("PDF Page Count:", pageCount);

    if (pageCount !== 1) {
      throw new Error(`Expected single-page PDF (1 page), but generated ${pageCount} pages.`);
    }

    // Verify PDF Magic Bytes (%PDF-)
    const pdfHeader = pdfBuffer.subarray(0, 5).toString("utf8");
    console.log("PDF Header signature:", pdfHeader);

    if (pdfHeader !== "%PDF-") {
      throw new Error(`Invalid PDF header signature. Expected '%PDF-', got '${pdfHeader}'`);
    }

    if (pdfBuffer.length < 1000) {
      throw new Error("Generated PDF buffer is unexpectedly small");
    }

    console.log("✅ PDF Invoice generation unit test passed successfully!");
  } finally {
    console.log("Cleanup completed.");
  }
}

runPdfInvoiceTest().catch((err) => {
  console.error("PDF Invoice test failed ❌:", err);
  process.exit(1);
});
