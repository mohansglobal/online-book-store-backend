import mongoose from "mongoose";

import { AddressModel, type AddressType } from "../models/address.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import type {
  CreateAddressInput,
  UpdateAddressInput,
} from "../validation/address.schema.js";

export const getAddressesService = async (
  userId: string,
  addressType?: AddressType,
) => {
  const filter: Record<string, unknown> = {
    user: new mongoose.Types.ObjectId(userId),
  };

  if (addressType) {
    filter.addressType = addressType;
  }

  const addresses = await AddressModel.find(filter)
    .populate("countryRef", "name code phoneCode currency")
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  return addresses;
};


export const getDefaultAddressService = async (
  userId: string,
  addressType?: AddressType,
) => {
  const filter: Record<string, unknown> = {
    user: new mongoose.Types.ObjectId(userId),
    isDefault: true,
  };

  if (addressType) {
    filter.addressType = addressType;
  }

  const address = await AddressModel.findOne(filter)
    .populate("countryRef", "name code phoneCode currency")
    .sort({ createdAt: -1 })
    .lean();

  return address;
};


export const getAddressByIdService = async (
  userId: string,
  addressId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    throw new AppError("Invalid address ID", HTTP_STATUS.BAD_REQUEST);
  }

  const address = await AddressModel.findOne({
    _id: addressId,
    user: userId,
  })
    .populate("countryRef", "name code phoneCode currency")
    .lean();

  if (!address) {
    throw new AppError("Address not found", HTTP_STATUS.NOT_FOUND);
  }

  return address;
};

export const createAddressService = async (
  userId: string,
  input: CreateAddressInput,
) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Check if this is the first address of this type for the user
  const existingCount = await AddressModel.countDocuments({
    user: userObjectId,
    addressType: input.addressType,
  });

  const shouldBeDefault = input.isDefault || existingCount === 0;

  if (shouldBeDefault) {
    // Unset existing default of the same type
    await AddressModel.updateMany(
      { user: userObjectId, addressType: input.addressType },
      { isDefault: false },
    );
  }

  const address = await AddressModel.create({
    user: userObjectId,
    addressType: input.addressType,
    fullName: input.fullName,
    email: input.email,
    mobileNumber: input.mobileNumber,
    country: input.country,
    countryRef: input.countryRef
      ? new mongoose.Types.ObjectId(input.countryRef)
      : undefined,
    state: input.state,
    city: input.city,
    postalCode: input.postalCode,
    streetAddress: input.streetAddress,
    apartment: input.apartment ?? "",
    isDefault: shouldBeDefault,
  });

  logger.info(
    { userId, addressId: address._id.toString(), type: input.addressType },
    "Address created successfully",
  );

  return address;
};

export const updateAddressService = async (
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    throw new AppError("Invalid address ID", HTTP_STATUS.BAD_REQUEST);
  }

  const address = await AddressModel.findOne({
    _id: addressId,
    user: userId,
  });

  if (!address) {
    throw new AppError("Address not found", HTTP_STATUS.NOT_FOUND);
  }

  const targetType = input.addressType || address.addressType;

  if (input.isDefault) {
    await AddressModel.updateMany(
      { user: userId, addressType: targetType },
      { isDefault: false },
    );
  }

  if (input.addressType !== undefined) address.addressType = input.addressType;
  if (input.fullName !== undefined) address.fullName = input.fullName;
  if (input.email !== undefined) address.email = input.email;
  if (input.mobileNumber !== undefined) address.mobileNumber = input.mobileNumber;
  if (input.country !== undefined) address.country = input.country;
  if (input.countryRef !== undefined) {
    address.countryRef = input.countryRef
      ? new mongoose.Types.ObjectId(input.countryRef)
      : undefined;
  }
  if (input.state !== undefined) address.state = input.state;
  if (input.city !== undefined) address.city = input.city;
  if (input.postalCode !== undefined) address.postalCode = input.postalCode;
  if (input.streetAddress !== undefined) address.streetAddress = input.streetAddress;
  if (input.apartment !== undefined) address.apartment = input.apartment;
  if (input.isDefault !== undefined) address.isDefault = input.isDefault;

  await address.save();
  logger.info({ userId, addressId }, "Address updated successfully");

  return address;
};

export const setDefaultAddressService = async (
  userId: string,
  addressId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    throw new AppError("Invalid address ID", HTTP_STATUS.BAD_REQUEST);
  }

  const address = await AddressModel.findOne({
    _id: addressId,
    user: userId,
  });

  if (!address) {
    throw new AppError("Address not found", HTTP_STATUS.NOT_FOUND);
  }

  // Unset all of same type
  await AddressModel.updateMany(
    { user: userId, addressType: address.addressType },
    { isDefault: false },
  );

  address.isDefault = true;
  await address.save();

  logger.info(
    { userId, addressId, addressType: address.addressType },
    "Address set as default",
  );

  return address;
};

export const deleteAddressService = async (
  userId: string,
  addressId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    throw new AppError("Invalid address ID", HTTP_STATUS.BAD_REQUEST);
  }

  const address = await AddressModel.findOneAndDelete({
    _id: addressId,
    user: userId,
  });

  if (!address) {
    throw new AppError("Address not found", HTTP_STATUS.NOT_FOUND);
  }

  // If deleted address was default, promote the next remaining address of this type
  if (address.isDefault) {
    const nextAddress = await AddressModel.findOne({
      user: userId,
      addressType: address.addressType,
    }).sort({ createdAt: -1 });

    if (nextAddress) {
      nextAddress.isDefault = true;
      await nextAddress.save();
    }
  }

  logger.info({ userId, addressId }, "Address deleted successfully");
  return { message: "Address deleted successfully" };
};
