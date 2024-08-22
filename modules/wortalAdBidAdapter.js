import { formatQS, deepAccess, logWarn } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js'

const BIDDER_CODE = 'wortal';
const BIDDER_URL = 'https://ads.wortal.ai/api/v1/prebid/bid/';
const DEFAULT_TTL = 180;
const DEFAULT_CURRENCY = 'USD';
const SUPPORTED_MEDIA_TYPES = [BANNER]

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: SUPPORTED_MEDIA_TYPES,

  isBidRequestValid: function(bid) {
    const { params } = bid;
    if (!params) {
      logWarn(BIDDER_CODE, 'params is required.')
      return false;
    }

    if (!params.adUnitId) {
      logWarn(BIDDER_CODE, 'adUnitId is required.')
      return false;
    }

    if (!params.pageId) {
      logWarn(BIDDER_CODE, 'pageId is required.')
      return false;
    }

    return true;
  },

  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {ExtendedBidRequest[]} validBidRequests An array of bids.
   * @param {BidderRequest} bidderRequest Bidder request object.
   * @returns {WortalAdServerRequest[]} Objects describing the requests to the server.
   */
  buildRequests: function(validBidRequests, bidderRequest) {
    let referrer = '';
    let domain = '';
    let page = '';

    if (bidderRequest && bidderRequest.refererInfo) {
      referrer = bidderRequest.refererInfo.ref;
      domain = bidderRequest.refererInfo.domain;
      page = bidderRequest.refererInfo.page;
    }

    let timeout = null;
    if (bidderRequest) {
      timeout = bidderRequest.timeout;
    }

    return validBidRequests.map((bidRequest) => {
      const { params } = bidRequest;
      const { pageId, adUnitId } = params;

      const queryParams = {
        'pageId': pageId,
        'adUnitId': adUnitId,
      };

      const gdprApplies = Boolean(deepAccess(bidderRequest, 'gdprConsent.gdprApplies'));
      if (gdprApplies) {
        const consentString = deepAccess(bidderRequest, 'gdprConsent.consentString');
        queryParams['gdpr'] = 1;
        queryParams['tcf-consent'] = consentString;
      }

      const imp = {
        id: adUnitId,
        banner: mapBanner(bidRequest),
      };

      const data = {
        id: bidRequest.bidId,
        imp: [imp],
        site: {
          ref: referrer,
          page,
          domain,
        },
        tmax: timeout,
      };

      const queryParamsString = formatQS(queryParams);
      return {
        method: 'POST',
        url: BIDDER_URL + `?${queryParamsString}`,
        data,
        options: {
          contentType: 'application/json',
          customHeaders: {
            'x-openrtb-version': 2.5
          }
        },
        bidRequest,
      };
    });
  },

  interpretResponse: interpretResponse,
}

/**
 * @param {ExtendedBidRequest} bidRequest
 */
function mapBanner(bidRequest) {
  if (deepAccess(bidRequest, 'mediaTypes.banner')) {
    const sizes = bidRequest.sizes || bidRequest.mediaTypes.banner.sizes;
    const format = sizes.map((size) => ({
      w: size[0],
      h: size[1],
    }));
    const { w, h } = format[0];

    return {
      w,
      h,
    }
  }
}

/**
 * Unpack the response from the server into a list of bids.
 *
 * @param {ServerResponse} serverResponse A successful response from the server.
 * @param {WortalAdServerRequest} wortalAdServerRequest
 * @return {Bid[]} An array of bids which were nested inside the server.
 */
function interpretResponse(serverResponse, { bidRequest }) {
  let response = serverResponse.body;
  if (!response.bid) {
    return [];
  }
  const { bid } = serverResponse.body;
  const bidReceived = bid;
  const bidResponses = [];

  const currency = bid.cur || DEFAULT_CURRENCY;

  const price = bidReceived.cpm;
  /** @type {Bid} */
  let prBid = {
    requestId: bidRequest.bidId,
    cpm: price,
    currency: currency,
    width: bidReceived.width,
    height: bidReceived.height,
    creativeId: bidReceived.creative_id,
    mediaType: BANNER,
    ad: bidReceived.ad,
    netRevenue: true,
    ttl: DEFAULT_TTL,

    meta: {
      advertiserDomains: bidReceived.adomain && bidReceived.adomain.length > 0 ? bidReceived.adomain : [],
    }
  }

  bidResponses.push(prBid);

  return bidResponses;
}

registerBidder(spec);
