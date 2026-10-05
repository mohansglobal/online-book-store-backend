import PDFDocument from "pdfkit";
import type { OrderConfirmationEmailJobPayload } from "../types/queue.types.js";

const formatCurrency = (paise = 0): string => {
  return (paise / 100).toFixed(2);
};

const formatDate = (date?: string | Date): string => {
  return new Date(date ?? Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const generateOrderInvoicePdf = (
  data: OrderConfirmationEmailJobPayload,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    // Single-page A4 Portrait document (595.28 x 841.89 pt)
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margin: 36,
      bufferPages: true,
    });





    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_WIDTH = doc.page.width; // 595.28
    const PAGE_HEIGHT = doc.page.height; // 841.89

    const LEFT = 36;
    const RIGHT = PAGE_WIDTH - 36; // 559.28
    const CONTENT_WIDTH = RIGHT - LEFT; // 523.28

    const black = "#111111";
    const gray = "#555555";
    const lightGray = "#E5E5E5";

    const extendedData = data as typeof data & {
      invoiceNumber?: string;
      invoiceDate?: string | Date;
      createdAt?: string | Date;
      billingAddress?: typeof data.shippingAddress;
      seller?: {
        name?: string;
        address?: string;
        gstin?: string;
        pan?: string;
      };
    };

    const seller = {
      name: extendedData.seller?.name ?? "ONLINE BOOKSTORE",
      address:
        extendedData.seller?.address ??
        "Seller registered address not available",
      gstin: extendedData.seller?.gstin ?? "-",
      pan: extendedData.seller?.pan ?? "-",
    };

    const billingAddress =
      extendedData.billingAddress ?? data.shippingAddress;

    const invoiceNumber =
      extendedData.invoiceNumber ?? `INV-${data.orderNumber}`;

    const orderDate = formatDate(extendedData.createdAt);
    const invoiceDate = formatDate(
      extendedData.invoiceDate ?? extendedData.createdAt,
    );

    // HELPERS
    const drawLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      width = 0.5,
    ) => {
      doc
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .lineWidth(width)
        .strokeColor(black)
        .stroke();
    };

    const text = (
      value: string,
      x: number,
      y: number,
      options: PDFKit.Mixins.TextOptions = {},
    ) => {
      doc.text(value, x, y, options);
    };

    const addressToLines = (
      address: typeof data.shippingAddress,
    ): string[] => {
      const lines: string[] = [];

      if (address.fullName) {
        lines.push(address.fullName);
      }
      if (address.streetAddress) {
        lines.push(address.streetAddress);
      }
      const cityState = [address.city, address.state, address.postalCode]
        .filter(Boolean)
        .join(", ");
      if (cityState) {
        lines.push(cityState);
      }
      if (address.country) {
        lines.push(address.country);
      }
      if (address.mobileNumber) {
        lines.push(`Phone: ${address.mobileNumber}`);
      }
      return lines;
    };

    const drawAddress = (
      heading: string,
      address: typeof data.shippingAddress,
      x: number,
      y: number,
      width: number,
    ) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(black)
        .text(heading, x, y, { width });

      let cursorY = y + 13;

      addressToLines(address).forEach((line, index) => {
        doc
          .font(index === 0 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(6.8)
          .fillColor(black)
          .text(line, x, cursorY, { width, lineGap: 1 });
        cursorY += 9.5;
      });
    };

    // --------------------------------------------------
    // HEADER
    // --------------------------------------------------
    const headerY = 32;

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(black)
      .text("Tax Invoice", LEFT, headerY);

    const metaX = LEFT + 90;
    const metaValueX = metaX + 45;

    doc.fontSize(6.8).font("Helvetica");

    doc.text("Order Id:", metaX, headerY);
    doc
      .font("Helvetica-Bold")
      .text(data.orderNumber, metaValueX, headerY, { width: 90 });

    doc.font("Helvetica").text("Order Date:", metaX, headerY + 11);
    doc.font("Helvetica-Bold").text(orderDate, metaValueX, headerY + 11);

    const invoiceX = LEFT + 230;

    doc.font("Helvetica").text("Invoice No:", invoiceX, headerY);
    doc
      .font("Helvetica-Bold")
      .text(invoiceNumber, invoiceX + 50, headerY, { width: 110 });

    doc.font("Helvetica").text("Invoice Date:", invoiceX, headerY + 11);
    doc.font("Helvetica-Bold").text(invoiceDate, invoiceX + 50, headerY + 11);

    const taxMetaX = LEFT + 400;

    doc.font("Helvetica").text("GSTIN:", taxMetaX, headerY);
    doc
      .font("Helvetica-Bold")
      .text(seller.gstin, taxMetaX + 32, headerY, { width: 90 });

    doc.font("Helvetica").text("PAN:", taxMetaX, headerY + 11);
    doc
      .font("Helvetica-Bold")
      .text(seller.pan, taxMetaX + 32, headerY + 11, { width: 90 });

    // Header dividing line
    drawLine(LEFT, headerY + 26, RIGHT, headerY + 26, 0.5);

    // --------------------------------------------------
    // ADDRESS SECTION (3 Columns)
    // --------------------------------------------------
    const addressY = 66;
    const colGap = 12;
    const colWidth = (CONTENT_WIDTH - colGap * 2) / 3;

    // SOLD BY
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Sold By", LEFT, addressY);

    doc
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .text(seller.name, LEFT, addressY + 13, { width: colWidth });

    doc
      .font("Helvetica")
      .fontSize(6.8)
      .text(seller.address, LEFT, addressY + 23, {
        width: colWidth,
        lineGap: 1.5,
      });

    // SHIPPING ADDRESS
    drawAddress(
      "Shipping Address",
      data.shippingAddress,
      LEFT + colWidth + colGap,
      addressY,
      colWidth,
    );

    // BILLING ADDRESS
    drawAddress(
      "Billing Address",
      billingAddress,
      LEFT + (colWidth + colGap) * 2,
      addressY,
      colWidth,
    );

    // --------------------------------------------------
    // TABLE
    // --------------------------------------------------
    const tableTop = 138;

    const columns = {
      product: { x: LEFT, width: 115 },
      description: { x: LEFT + 115, width: 75 },
      qty: { x: LEFT + 190, width: 25 },
      gross: { x: LEFT + 215, width: 50 },
      discount: { x: LEFT + 265, width: 45 },
      taxable: { x: LEFT + 310, width: 50 },
      cgst: { x: LEFT + 360, width: 40 },
      sgst: { x: LEFT + 400, width: 40 },
      total: { x: LEFT + 440, width: CONTENT_WIDTH - 440 }, // 83.28 pt
    };

    const headerHeight = 24;

    doc
      .rect(LEFT, tableTop, CONTENT_WIDTH, headerHeight)
      .lineWidth(0.5)
      .strokeColor(black)
      .stroke();

    // vertical header lines
    [
      columns.description.x,
      columns.qty.x,
      columns.gross.x,
      columns.discount.x,
      columns.taxable.x,
      columns.cgst.x,
      columns.sgst.x,
      columns.total.x,
    ].forEach((x) => {
      drawLine(x, tableTop, x, tableTop + headerHeight);
    });

    doc.font("Helvetica-Bold").fontSize(6.2).fillColor(black);

    text("Product", columns.product.x + 2, tableTop + 8, {
      width: columns.product.width - 4,
      align: "center",
    });

    text("Description", columns.description.x + 2, tableTop + 8, {
      width: columns.description.width - 4,
      align: "center",
    });

    text("Qty", columns.qty.x, tableTop + 8, {
      width: columns.qty.width,
      align: "center",
    });

    text("Gross\nAmount", columns.gross.x, tableTop + 4, {
      width: columns.gross.width,
      align: "center",
    });

    text("Discount", columns.discount.x, tableTop + 8, {
      width: columns.discount.width,
      align: "center",
    });

    text("Taxable\nValue", columns.taxable.x, tableTop + 4, {
      width: columns.taxable.width,
      align: "center",
    });

    text("CGST", columns.cgst.x, tableTop + 8, {
      width: columns.cgst.width,
      align: "center",
    });

    text("SGST /\nUGST", columns.sgst.x, tableTop + 4, {
      width: columns.sgst.width,
      align: "center",
    });

    text("Total", columns.total.x, tableTop + 8, {
      width: columns.total.width,
      align: "center",
    });

    // --------------------------------------------------
    // ITEM ROWS
    // --------------------------------------------------
    let currentY = tableTop + headerHeight;

    data.items.forEach((originalItem) => {
      const item = originalItem as typeof originalItem & {
        hsn?: string;
        gstRate?: number;
        discountInPaise?: number;
        taxableValueInPaise?: number;
        cgstInPaise?: number;
        sgstInPaise?: number;
        igstInPaise?: number;
        isbn?: string;
        sku?: string;
      };

      const titleHeight = doc.heightOfString(item.title, {
        width: columns.product.width - 6,
      });

      const rowHeight = Math.max(28, titleHeight + 14);

      // outer row
      doc
        .rect(LEFT, currentY, CONTENT_WIDTH, rowHeight)
        .lineWidth(0.4)
        .strokeColor(black)
        .stroke();

      // vertical columns
      [
        columns.description.x,
        columns.qty.x,
        columns.gross.x,
        columns.discount.x,
        columns.taxable.x,
        columns.cgst.x,
        columns.sgst.x,
        columns.total.x,
      ].forEach((x) => {
        drawLine(x, currentY, x, currentY + rowHeight, 0.35);
      });

      // PRODUCT
      doc
        .font("Helvetica")
        .fontSize(6.2)
        .fillColor(black)
        .text(item.title, columns.product.x + 3, currentY + 5, {
          width: columns.product.width - 6,
          lineGap: 1,
        });

      if (item.isbn) {
        doc
          .fontSize(5.5)
          .fillColor(gray)
          .text(
            `ISBN: ${item.isbn}`,
            columns.product.x + 3,
            currentY + rowHeight - 12,
            { width: columns.product.width - 6 },
          );
      }

      // DESCRIPTION
      const descriptionParts: string[] = [];
      if (item.hsn) {
        descriptionParts.push(`HSN: ${item.hsn}`);
      }
      if (item.gstRate !== undefined) {
        descriptionParts.push(`GST: ${item.gstRate}%`);
      }
      if (item.sku) {
        descriptionParts.push(`SKU: ${item.sku}`);
      }

      doc
        .font("Helvetica")
        .fontSize(6)
        .fillColor(black)
        .text(
          descriptionParts.length ? descriptionParts.join(" | ") : "Book",
          columns.description.x + 3,
          currentY + 6,
          { width: columns.description.width - 6, lineGap: 1 },
        );

      // QTY
      doc
        .font("Helvetica")
        .fontSize(6.5)
        .text(String(item.quantity), columns.qty.x, currentY + 6, {
          width: columns.qty.width,
          align: "center",
        });

      // GROSS
      const grossAmount = item.priceInPaise * item.quantity;
      doc.text(
        formatCurrency(grossAmount),
        columns.gross.x + 2,
        currentY + 6,
        { width: columns.gross.width - 4, align: "right" },
      );

      // DISCOUNT
      const discount =
        item.discountInPaise ??
        Math.max(0, grossAmount - item.subtotalInPaise);
      doc.text(
        discount > 0 ? formatCurrency(discount) : "0.00",
        columns.discount.x + 2,
        currentY + 6,
        { width: columns.discount.width - 4, align: "right" },
      );

      // TAXABLE VALUE
      doc.text(
        item.taxableValueInPaise !== undefined
          ? formatCurrency(item.taxableValueInPaise)
          : formatCurrency(item.subtotalInPaise),
        columns.taxable.x + 2,
        currentY + 6,
        { width: columns.taxable.width - 4, align: "right" },
      );

      // CGST
      doc.text(
        item.cgstInPaise !== undefined
          ? formatCurrency(item.cgstInPaise)
          : "-",
        columns.cgst.x + 2,
        currentY + 6,
        { width: columns.cgst.width - 4, align: "right" },
      );

      // SGST
      doc.text(
        item.sgstInPaise !== undefined
          ? formatCurrency(item.sgstInPaise)
          : "-",
        columns.sgst.x + 2,
        currentY + 6,
        { width: columns.sgst.width - 4, align: "right" },
      );

      // TOTAL
      doc
        .font("Helvetica-Bold")
        .text(
          formatCurrency(item.subtotalInPaise),
          columns.total.x + 2,
          currentY + 6,
          { width: columns.total.width - 4, align: "right" },
        );

      currentY += rowHeight;
    });

    // --------------------------------------------------
    // SHIPPING CHARGE ROW
    // --------------------------------------------------
    const shippingRowHeight = 20;

    doc
      .rect(LEFT, currentY, CONTENT_WIDTH, shippingRowHeight)
      .lineWidth(0.4)
      .strokeColor(black)
      .stroke();

    [
      columns.description.x,
      columns.qty.x,
      columns.gross.x,
      columns.discount.x,
      columns.taxable.x,
      columns.cgst.x,
      columns.sgst.x,
      columns.total.x,
    ].forEach((x) => {
      drawLine(x, currentY, x, currentY + shippingRowHeight, 0.35);
    });

    doc.font("Helvetica-Bold").fontSize(6.2);
    doc.text("Shipping Charge", columns.description.x + 3, currentY + 6, {
      width: columns.description.width - 6,
    });

    doc
      .font("Helvetica")
      .text(
        data.deliveryChargeInPaise > 0
          ? formatCurrency(data.deliveryChargeInPaise)
          : "0.00",
        columns.total.x + 2,
        currentY + 6,
        { width: columns.total.width - 4, align: "right" },
      );

    currentY += shippingRowHeight;

    // --------------------------------------------------
    // TOTAL QTY / TOTAL PRICE
    // --------------------------------------------------
    const totalQty = data.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const totalLineHeight = 20;

    doc
      .rect(LEFT, currentY, CONTENT_WIDTH, totalLineHeight)
      .lineWidth(0.5)
      .strokeColor(black)
      .stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .fillColor(black)
      .text(`TOTAL QTY: ${totalQty}`, LEFT + 4, currentY + 6);

    doc.text(
      `TOTAL PRICE: Rs. ${formatCurrency(data.totalAmountInPaise)}`,
      RIGHT - 200,
      currentY + 5,
      { width: 195, align: "right" },
    );

    doc
      .font("Helvetica")
      .fontSize(5.5)
      .text("All values are in INR.", RIGHT - 200, currentY + 12, {
        width: 195,
        align: "right",
      });

    currentY += totalLineHeight;

    // --------------------------------------------------
    // OPTIONAL COUPON
    // --------------------------------------------------
    if (data.couponDiscountInPaise > 0) {
      doc
        .font("Helvetica")
        .fontSize(6.2)
        .fillColor(black)
        .text(
          `Coupon Discount: Rs. ${formatCurrency(data.couponDiscountInPaise)}`,
          RIGHT - 210,
          currentY + 4,
          { width: 205, align: "right" },
        );

      currentY += 14;
    }

    // --------------------------------------------------
    // SELLER REGISTERED ADDRESS & DECLARATION
    // --------------------------------------------------
    const infoY = currentY + 8;

    doc
      .font("Helvetica-Bold")
      .fontSize(6.2)
      .fillColor(black)
      .text(`Seller Registered Address: ${seller.name},`, LEFT, infoY, {
        width: 300,
      });

    doc
      .font("Helvetica")
      .fontSize(5.8)
      .text(seller.address, LEFT, infoY + 9, { width: 300 });

    doc
      .font("Helvetica-Bold")
      .fontSize(6.2)
      .text("Declaration", LEFT, infoY + 23);

    doc
      .font("Helvetica")
      .fontSize(5.5)
      .text(
        "The goods sold are intended for end user consumption and not for resale.",
        LEFT,
        infoY + 32,
        { width: 330 },
      );

    // --------------------------------------------------
    // SIGNATURE (Right)
    // --------------------------------------------------
    const signatureX = RIGHT - 110;
    const signatureY = infoY + 10;

    doc
      .rect(signatureX, signatureY, 80, 48)
      .lineWidth(0.3)
      .strokeColor(lightGray)
      .stroke();

    doc
      .font("Helvetica-Oblique")
      .fontSize(11)
      .fillColor(gray)
      .text("Sign.", signatureX + 20, signatureY + 15, { width: 40 });

    doc
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .fillColor(black)
      .text(seller.name, signatureX - 15, signatureY + 53, {
        width: 110,
        align: "center",
      });

    doc
      .font("Helvetica")
      .fontSize(5.5)
      .text("Authorized Signatory", signatureX - 15, signatureY + 62, {
        width: 110,
        align: "center",
      });

    // --------------------------------------------------
    // FOOTER (Fixed at Bottom of A4 Portrait Page)
    // --------------------------------------------------
    const footerY = PAGE_HEIGHT - 65;

    doc
      .font("Helvetica")
      .fontSize(5.8)
      .fillColor(black)
      .text("E. & O.E.", LEFT, footerY);

    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text("ONLINE BOOKSTORE", LEFT + 10, footerY + 12);

    doc
      .font("Helvetica")
      .fontSize(6)
      .text("Ordered Through Online BookStore", PAGE_WIDTH / 2 - 60, footerY + 2, {
        width: 120,
        align: "center",
      });

    doc.end();
  });
};