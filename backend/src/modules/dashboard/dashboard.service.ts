import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrderStatus, SaleStatus } from '../../common/enums';
import { PurchaseOrder } from '../entities/purchase-order.entity';
import { Sale } from '../entities/sale.entity';
import { MedicinesService } from '../medicines/medicines.service';
import { SalesService } from '../sales/sales.service';

/** Percentage change between two values, safe against divide-by-zero. */
const pctChange = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly salesService: SalesService,
    private readonly medicinesService: MedicinesService,
    @InjectRepository(Sale)
    private readonly salesRepository: Repository<Sale>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
  ) {}

  /**
   * The single payload that powers the whole dashboard screen: KPI tiles,
   * alerts, trend chart, recent activity and best sellers.
   */
  async getOverview(trendDays = 7, alertLimit = 6) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [
      todaySummary,
      yesterdaySummary,
      trend,
      inventory,
      lowStock,
      expiringSoon,
      recentSales,
      topProducts,
      orderStats,
    ] = await Promise.all([
      this.salesService.getDailySummary(today.toISOString().slice(0, 10)),
      this.salesService.getDailySummary(yesterday.toISOString().slice(0, 10)),
      this.salesService.getSalesTrend(trendDays),
      this.medicinesService.getStockLevel(),
      this.medicinesService.findLowStock(alertLimit),
      this.medicinesService.findExpiringSoon(undefined, alertLimit),
      this.salesService.getRecentSales(8),
      this.salesService.getTopProducts(5, 30),
      this.getOrderStats(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      sales: {
        today: todaySummary,
        yesterday: yesterdaySummary,
        revenueChangePct: pctChange(todaySummary.revenue, yesterdaySummary.revenue),
        transactionChangePct: pctChange(
          todaySummary.transactionCount,
          yesterdaySummary.transactionCount,
        ),
        trend,
      },
      inventory,
      alerts: {
        lowStock,
        expiringSoon,
      },
      orderStats,
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        customerName: sale.customerName ?? 'Walk-in customer',
        cashierName: sale.cashier?.fullName ?? 'Staff',
        itemCount: sale.items?.length ?? 0,
        itemSummary: (sale.items ?? [])
          .slice(0, 2)
          .map((item) => `${item.medicineName} (x${item.quantity})`)
          .join(', '),
        totalAmount: sale.totalAmount,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        createdAt: sale.createdAt,
      })),
      topProducts,
    };
  }

  /** Completed / pending / cancelled counters shown on the order list screen. */
  async getOrderStats() {
    const [completed, cancelled, pendingSales] = await Promise.all([
      this.countSalesByStatus([SaleStatus.COMPLETED]),
      this.countSalesByStatus([SaleStatus.REFUNDED, SaleStatus.VOID]),
      this.countSalesByStatus([SaleStatus.VOID]),
    ]);

    const [draftOrders, orderedOrders, receivedOrders, cancelledOrders] =
      await Promise.all([
        this.countPurchaseOrders(PurchaseOrderStatus.DRAFT),
        this.countPurchaseOrders(PurchaseOrderStatus.ORDERED),
        this.countPurchaseOrders(PurchaseOrderStatus.PARTIALLY_RECEIVED),
        this.countPurchaseOrders(PurchaseOrderStatus.CANCELLED),
      ]);

    return {
      completed: { sales: completed, purchaseOrders: receivedOrders },
      pending: {
        sales: pendingSales,
        purchaseOrders: draftOrders + orderedOrders,
      },
      cancelled: { sales: cancelled, purchaseOrders: cancelledOrders },
    };
  }

  /** Global search across invoices, products and suppliers for the top bar. */
  async globalSearch(term: string) {
    if (!term || term.trim().length < 2) {
      return { invoices: [], products: [], limited: true };
    }

    const [invoices, products] = await Promise.all([
      this.salesRepository
        .createQueryBuilder('sale')
        .select(['sale.id', 'sale.invoiceNumber', 'sale.customerName', 'sale.totalAmount', 'sale.createdAt'])
        .where('sale.invoiceNumber ILIKE :term OR sale.customerName ILIKE :term', {
          term: `%${term}%`,
        })
        .orderBy('sale.createdAt', 'DESC')
        .limit(5)
        .getMany(),
      this.medicinesService.searchForPos(term, 5),
    ]);

    return { invoices, products, limited: false };
  }

  private countSalesByStatus(statuses: SaleStatus[]): Promise<number> {
    return this.salesRepository
      .createQueryBuilder('sale')
      .where('sale.status IN (:...statuses)', { statuses })
      .getCount();
  }

  private countPurchaseOrders(status: PurchaseOrderStatus): Promise<number> {
    return this.purchaseOrdersRepository.count({ where: { status } });
  }
}
