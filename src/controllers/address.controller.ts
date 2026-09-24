import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getAddressesService,
  getDefaultAddressService,
  getAddressByIdService,
  createAddressService,
  updateAddressService,
  setDefaultAddressService,
  deleteAddressService,
} from "../services/address.service.js";
import type {
  AddressQueryInput,
  CreateAddressInput,
  UpdateAddressInput,
} from "../validation/address.schema.js";

export const getAddresses = asyncHandler(async (req, res) => {
  const query = req.query as unknown as AddressQueryInput;
  const addresses = await getAddressesService(req.user!.id, query.addressType);
  apiResponse(res, HTTP_STATUS.OK, "Addresses retrieved successfully", addresses);
});

export const getDefaultAddress = asyncHandler(async (req, res) => {
  const query = req.query as unknown as AddressQueryInput;
  const address = await getDefaultAddressService(req.user!.id, query.addressType);
  apiResponse(res, HTTP_STATUS.OK, "Default address retrieved successfully", address);
});

export const getAddressById = asyncHandler(async (req, res) => {
  const address = await getAddressByIdService(
    req.user!.id,
    req.params.id as string,
  );
  apiResponse(res, HTTP_STATUS.OK, "Address retrieved successfully", address);
});

export const createAddress = asyncHandler(async (req, res) => {
  const address = await createAddressService(
    req.user!.id,
    req.body as CreateAddressInput,
  );
  apiResponse(
    res,
    HTTP_STATUS.CREATED,
    "Address created successfully",
    address,
  );
});

export const updateAddress = asyncHandler(async (req, res) => {
  const address = await updateAddressService(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateAddressInput,
  );
  apiResponse(res, HTTP_STATUS.OK, "Address updated successfully", address);
});

export const setDefaultAddress = asyncHandler(async (req, res) => {
  const address = await setDefaultAddressService(
    req.user!.id,
    req.params.id as string,
  );
  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Address set as default successfully",
    address,
  );
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const result = await deleteAddressService(
    req.user!.id,
    req.params.id as string,
  );
  apiResponse(res, HTTP_STATUS.OK, "Address deleted successfully", result);
});


