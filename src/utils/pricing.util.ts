export type DiscountType = "PERCENTAGE" | "FLAT";
export type DiscountStatus = "NONE" | "UPCOMING" | "ACTIVE" | "EXPIRED";

export interface ListingDiscountSchedule {
  discountType: DiscountType;
  discountValue: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  isActive?: boolean;
  campaignName?: string | null;
}

export interface ResolvedPricing {
  mrpInPaise: number;
  sellingPriceInPaise: number;
  effectivePriceInPaise: number;
  mrp: number;
  sellingPrice: number;
  effectivePrice: number;
  price: number;
  priceInPaise: number;
  discountPercentage: number;
  isDiscountActive: boolean;
  discountStatus: DiscountStatus;
  discountSchedule?: ListingDiscountSchedule | null;
  activeDiscount?: {
    discountType: DiscountType;
    discountValue: number;
    discountAmountInPaise: number;
    startDate?: Date | null;
    endDate?: Date | null;
    campaignName?: string | null;
  };
}

export const resolveListingPricing = (
  listing: {
    mrpInPaise?: number;
    sellingPriceInPaise?: number;
    discountSchedule?: ListingDiscountSchedule | null;
  },
  referenceDate = new Date(),
): ResolvedPricing => {
  const mrpInPaise = listing?.mrpInPaise ?? listing?.sellingPriceInPaise ?? 0;
  const baseSellingPriceInPaise = listing?.sellingPriceInPaise ?? mrpInPaise;
  const schedule = listing?.discountSchedule;

  let effectivePriceInPaise = baseSellingPriceInPaise;
  let isDiscountActive = false;
  let discountStatus: DiscountStatus = "NONE";
  let activeDiscount: ResolvedPricing["activeDiscount"] = undefined;

  if (schedule && schedule.isActive !== false && schedule.discountValue > 0) {
    const hasStartDate = schedule.startDate !== undefined && schedule.startDate !== null;
    const hasEndDate = schedule.endDate !== undefined && schedule.endDate !== null;

    const startTime = hasStartDate ? new Date(schedule.startDate!).getTime() : null;
    const endTime = hasEndDate ? new Date(schedule.endDate!).getTime() : null;
    const currentTime = referenceDate.getTime();

    if (startTime !== null && currentTime < startTime) {
      discountStatus = "UPCOMING";
    } else if (endTime !== null && currentTime > endTime) {
      discountStatus = "EXPIRED";
    } else {
      discountStatus = "ACTIVE";
      isDiscountActive = true;

      let discountAmountInPaise = 0;
      if (schedule.discountType === "PERCENTAGE") {
        discountAmountInPaise = Math.round((mrpInPaise * schedule.discountValue) / 100);
      } else {
        discountAmountInPaise = Math.round(schedule.discountValue * 100);
      }

      // Discount cannot exceed MRP
      discountAmountInPaise = Math.min(discountAmountInPaise, mrpInPaise);
      effectivePriceInPaise = Math.max(0, mrpInPaise - discountAmountInPaise);

      activeDiscount = {
        discountType: schedule.discountType,
        discountValue: schedule.discountValue,
        discountAmountInPaise,
        startDate: hasStartDate ? new Date(schedule.startDate!) : null,
        endDate: hasEndDate ? new Date(schedule.endDate!) : null,
        campaignName: schedule.campaignName,
      };
    }
  }

  const effectiveSellingPrice = effectivePriceInPaise;
  const discountPercentage =
    mrpInPaise > 0
      ? Math.round(((mrpInPaise - effectiveSellingPrice) / mrpInPaise) * 100)
      : 0;

  return {
    mrpInPaise,
    sellingPriceInPaise: baseSellingPriceInPaise,
    effectivePriceInPaise,
    mrp: Math.round(mrpInPaise / 100),
    sellingPrice: Math.round(baseSellingPriceInPaise / 100),
    effectivePrice: Math.round(effectiveSellingPrice / 100),
    price: Math.round(effectiveSellingPrice / 100),
    priceInPaise: effectiveSellingPrice,
    discountPercentage,
    isDiscountActive,
    discountStatus,
    discountSchedule: schedule || null,
    activeDiscount,
  };
};
