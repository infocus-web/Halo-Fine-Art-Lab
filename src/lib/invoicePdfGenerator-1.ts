import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TrackedOrder } from '../types';

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  caeNumber?: string;
  caeExpiry?: string;
}

/**
 * Generates an official, luxury PDF invoice for an order.
 */
export function generateOrderInvoicePdf(order: TrackedOrder): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Primary Palette
  const darkCharcoal = [31, 28, 24]; // #1F1C18
  const goldAccent = [140, 109, 55]; // #8C6D37
  const softGray = [115, 107, 96]; // #736B60
  const lightBg = [250, 248, 245]; // #FAF8F5
  const borderLine = [214, 206, 190]; // #D6CEBE

  // 1. TOP HEADER BANNER
  doc.setFillColor(darkCharcoal[0], darkCharcoal[1], darkCharcoal[2]);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Gold accent bottom stripe
  doc.setFillColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.rect(0, 28, pageWidth, 1.5, 'F');

  // Brand Name
  doc.setTextColor(253, 252, 249);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('H A L O', margin, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(236, 200, 128); // Gold tint
  doc.text('FINE ART LAB · ENCUADERNACIÓN & REVELADO PROFESIONAL', margin, 20);

  // Type of Invoice Box (Letter "B" / "C")
  const letterBoxX = pageWidth / 2 - 8;
  doc.setFillColor(253, 252, 249);
  doc.roundedRect(letterBoxX, 6, 16, 17, 2, 2, 'F');
  doc.setDrawColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(letterBoxX, 6, 16, 17, 2, 2, 'S');

  doc.setTextColor(darkCharcoal[0], darkCharcoal[1], darkCharcoal[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('C', letterBoxX + 8, 16, { align: 'center' });
  doc.setFontSize(6);
  doc.text('COD. 011', letterBoxX + 8, 21, { align: 'center' });

  // Right Header: Invoice Title & Meta
  const cleanOrderNum = order.orderNumber.replace(/[^a-zA-Z0-9-]/g, '');
  const invoiceCode = `FC-0001-${cleanOrderNum.slice(-6) || '002026'}`;
  
  doc.setTextColor(253, 252, 249);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('FACTURA', pageWidth - margin, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(214, 206, 190);
  doc.text(`N°: ${invoiceCode}`, pageWidth - margin, 17, { align: 'right' });
  doc.text(`Fecha: ${order.createdAt || new Date().toLocaleDateString('es-AR')}`, pageWidth - margin, 22, { align: 'right' });

  // 2. COMPANY & ISSUER INFO
  let currentY = 36;
  doc.setTextColor(softGray[0], softGray[1], softGray[2]);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  
  doc.text('Razón Social: ALDERETE PABLO GABRIEL', margin, currentY);
  doc.text('CUIT: 20-28306117-6 · Ingresos Brutos: 742000', margin, currentY + 4);
  doc.text('Condición frente al IVA: Responsable Monotributo', margin, currentY + 8);
  doc.text('Domicilio: Necochea 336 Piso 1, Pilar, Pcia. de Buenos Aires', margin, currentY + 12);
  doc.text('Taller & Contacto: +54 9 11 3988-4256 | info@halofineart.com.ar', margin, currentY + 16);

  // Right side of Issuer info: Legal Meta
  const rightColX = pageWidth / 2 + 10;
  doc.text(`Punto de Venta: 0001 · Comp. Nro: ${cleanOrderNum.slice(-6) || '002026'}`, rightColX, currentY);
  doc.text(`Fecha de Inicio de Actividades: 07/04/2022`, rightColX, currentY + 4);
  doc.text(`Pedido de Referencia: #${order.orderNumber}`, rightColX, currentY + 8);
  doc.text(`Método de Pago: ${order.paymentMethod.toUpperCase()}`, rightColX, currentY + 12);
  doc.text(`Estado del Pedido: ${order.status.toUpperCase().replace('_', ' ')}`, rightColX, currentY + 16);

  // Divider Line
  currentY += 21;
  doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  // 3. RECIPIENT / CUSTOMER INFO SECTION
  currentY += 5;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'F');
  doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'S');

  // Customer Box Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.text('DATOS DEL CLIENTE Y DESTINATARIO', margin + 4, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(darkCharcoal[0], darkCharcoal[1], darkCharcoal[2]);

  // Customer Left column
  doc.text(`Nombre / Razón Social: ${order.customerName}`, margin + 4, currentY + 10);
  doc.text(`Condición IVA: Consumidor Final`, margin + 4, currentY + 15);
  doc.text(`Email: ${order.customerEmail}`, margin + 4, currentY + 20);

  // Customer Right column
  const custRightX = margin + contentWidth / 2;
  doc.text(`Teléfono: ${order.customerPhone || 'Registrado en sistema'}`, custRightX, currentY + 10);
  doc.text(`Dirección de Entrega: ${order.shippingAddress}, ${order.shippingCity}`, custRightX, currentY + 15);
  const shippingLabel = order.shippingMethod === 'pilar_direct' 
    ? 'Entrega Directa Pilar (Radio 20 km Bonificada)' 
    : 'Envío Nacional Expreso / Correo Argentino';
  doc.text(`Logística: ${shippingLabel}`, custRightX, currentY + 20);

  // 4. ITEMS TABLE (jspdf-autotable)
  currentY += 29;

  const tableBody = order.items.map((item, index) => {
    const specs = [
      `Formato: ${item.format}`,
      `Tapa: ${item.cover} con estampado ${item.foil}`,
      `Apertura Layflat 180° · Papel Químico Fuji HD (${item.pages} páginas / ${Math.ceil(item.pages / 2)} pliegos)`,
      item.hasGiftBox ? 'Incluye Caja de Presentación Rígida de Lujo' : null,
    ].filter(Boolean).join('\n• ');

    return [
      String(index + 1).padStart(2, '0'),
      `${item.title}\n• ${specs}`,
      '1',
      `$ ${item.price.toLocaleString('es-AR')}`,
      `$ ${item.price.toLocaleString('es-AR')}`
    ];
  });

  // Calculate pricing breakdown
  const subtotal = order.totalPrice;
  const vatRate = 0.21;
  const netAmount = Math.round(subtotal / (1 + vatRate));
  const vatAmount = subtotal - netAmount;

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'DESCRIPCIÓN DEL PRODUCTO / SERVICIO ARTESANAL', 'CANT.', 'PRECIO UNITARIO', 'SUBTOTAL']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [31, 28, 24],
      textColor: [253, 252, 249],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      lineColor: [232, 226, 213],
      textColor: [31, 28, 24],
      valign: 'middle',
    },
    margin: { left: margin, right: margin },
  });

  // Get Y position after table
  // @ts-ignore
  let finalY = doc.lastAutoTable.finalY + 6;

  // 5. TOTALS & SUMMARY BOX
  const totalsBoxWidth = 85;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;

  // Left side: Payment details & Lab Seal
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, finalY, contentWidth - totalsBoxWidth - 6, 32, 2, 2, 'F');
  doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
  doc.roundedRect(margin, finalY, contentWidth - totalsBoxWidth - 6, 32, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.text('OBSERVACIONES & GARANTÍA DE TALLER HALO', margin + 4, finalY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(softGray[0], softGray[1], softGray[2]);
  doc.text('• Impresión química en papel fotográfico Fuji Crystal Archive con garantía de 100 años.', margin + 4, finalY + 11);
  doc.text('• Encuadernación artesanal cocida y encolada con apertura panorámica plana 180° Layflat.', margin + 4, finalY + 16);
  doc.text(`• Guía de despacho / Seguimiento: ${order.trackingCode || 'Retiro en Laboratorio Pilar o Entrega Local'}`, margin + 4, finalY + 21);
  doc.text('• Comprobante válido como constancia de garantía y control de calidad artesanal.', margin + 4, finalY + 26);

  // Right side: Totals Calculation
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(totalsBoxX, finalY, totalsBoxWidth, 32, 2, 2, 'F');
  doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
  doc.roundedRect(totalsBoxX, finalY, totalsBoxWidth, 32, 2, 2, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(softGray[0], softGray[1], softGray[2]);
  doc.text('Importe Neto Gravado:', totalsBoxX + 4, finalY + 6);
  doc.text(`$ ${netAmount.toLocaleString('es-AR')}`, pageWidth - margin - 4, finalY + 6, { align: 'right' });

  doc.text('IVA (21.00%):', totalsBoxX + 4, finalY + 12);
  doc.text(`$ ${vatAmount.toLocaleString('es-AR')}`, pageWidth - margin - 4, finalY + 12, { align: 'right' });

  doc.text('Envío Especial:', totalsBoxX + 4, finalY + 18);
  doc.text(order.shippingMethod === 'pilar_direct' ? 'BONIFICADO ($0)' : 'INCLUIDO', pageWidth - margin - 4, finalY + 18, { align: 'right' });

  // Total Final Bar
  doc.setFillColor(darkCharcoal[0], darkCharcoal[1], darkCharcoal[2]);
  doc.rect(totalsBoxX, finalY + 22, totalsBoxWidth, 10, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(236, 200, 128);
  doc.text('TOTAL FACTURADO:', totalsBoxX + 4, finalY + 28.5);
  doc.setTextColor(253, 252, 249);
  doc.text(`$ ${order.totalPrice.toLocaleString('es-AR')} ARS`, pageWidth - margin - 4, finalY + 28.5, { align: 'right' });

  // 6. NON-FISCAL NOTICE FOOTER BOX
  // NOTE: this PDF is generated entirely client-side and is NOT submitted to
  // AFIP's e-invoicing webservice, so it cannot carry a real CAE (Código de
  // Autorización Electrónico) — that code only exists once AFIP itself
  // authorizes a transaction. A previous version of this file fabricated a
  // CAE number here and printed "Comprobante Autorizado por AFIP", which
  // would have made every PDF a document falsely claiming an official tax
  // authorization it never received. Until real facturación electrónica is
  // wired in (via AFIP's own tools or a provider), this box says plainly
  // that it's an internal receipt, not a valid CAE-backed invoice.
  finalY += 38;

  doc.setFillColor(253, 252, 249);
  doc.setDrawColor(borderLine[0], borderLine[1], borderLine[2]);
  doc.roundedRect(margin, finalY, contentWidth, 18, 2, 2, 'S');

  const noticeX = margin + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(darkCharcoal[0], darkCharcoal[1], darkCharcoal[2]);
  doc.text('Comprobante Interno — No Válido como Factura Electrónica AFIP', noticeX, finalY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(softGray[0], softGray[1], softGray[2]);
  doc.text('Constancia de pedido y pago emitida por el sistema del taller. No reemplaza la factura electrónica oficial de AFIP.', noticeX, finalY + 12.5);

  // Bottom Copyright
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(softGray[0], softGray[1], softGray[2]);
  doc.text('HALO Fine Art Lab · Pilar, Buenos Aires, Argentina · www.halofineart.com.ar', pageWidth / 2, 288, { align: 'center' });

  return doc;
}

/**
 * Generates and triggers automatic download of the PDF invoice file in browser.
 */
export function downloadOrderInvoicePdf(order: TrackedOrder) {
  const doc = generateOrderInvoicePdf(order);
  const filename = `FACTURA_HALO_${order.orderNumber}.pdf`;
  doc.save(filename);
}

/**
 * Returns a Blob URL for previewing the invoice in an iframe or viewer.
 */
export function getOrderInvoiceBlobUrl(order: TrackedOrder): string {
  const doc = generateOrderInvoicePdf(order);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}
