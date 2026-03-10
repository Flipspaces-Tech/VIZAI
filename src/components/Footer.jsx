import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../styles/footer.css";

import vizIcon from "../assets/L1.png";
import flipspacesLogo from "../assets/FL LOGO.png";

export default function Footer() {
  const [copiedText, setCopiedText] = useState("");

  const supportPhone = "+91 82373 44185";
  const supportEmail = "nitesh.gaikwad@flipspaces.com";

  const handleCopyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(""), 1800);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <footer className="vwFooter">
      <div className="vwFooterContainer">
        <div className="vwFooterTop">
          <div className="vwFooterDivider" aria-hidden="true" />

          <div className="vwFooterBrand">
            <Link to="/" className="vwFooterLogoLink" aria-label="Go to Home">
              <img className="vwFooterVizLogo" src={vizIcon} alt="Vizwalk" />
            </Link>

            <div className="vwFooterDesc">
              Next-generation architectural visualization platform. Brings your
              designs to life with stunning realism.
            </div>
          </div>

          <div className="vwFooterRightBlock">
            <div className="vwFooterCol">
              <div className="vwFooterColTitle">PRODUCT</div>
              <a
                className="vwFooterLink vwFooterLinkNoUnderline"
                href="/updates"
              >
                Updates
              </a>
            </div>

            <div className="vwFooterCol">
              <div className="vwFooterColTitle">RESOURCES</div>

              <a
                className="vwFooterLink"
                href="https://docs.google.com/document/d/e/2PACX-1vSXd89uQ6zlQROTwFqh6OhvoJTn7s_Znrme5J1_uHRTBFbu36Zhcc1ZyPMjdYwWkNd_bs_mfxe9lEsa/pub"
                target="_blank"
                rel="noopener noreferrer"
              >
                FAQs
              </a>

              <button
                type="button"
                className="vwFooterLink vwFooterShortcutBtn"
                onClick={() =>
                  window.open(
                    "https://drive.google.com/file/d/1AT_Y3v2IQytEn2MOCFH9hnT6nFHdMUmC/view",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                Shortcut Guide
              </button>

              <div className="vwFooterSupportWrap">
                <button type="button" className="vwFooterSupportBtn">
                  Contact Support
                </button>

                <div className="vwFooterSupportTooltip">
                  <button
                    type="button"
                    className="vwFooterSupportItem"
                    onClick={() => handleCopyText(supportPhone)}
                    title="Click to copy phone number"
                  >
                    {supportPhone}
                  </button>

                  <button
                    type="button"
                    className="vwFooterSupportItem"
                    onClick={() => handleCopyText(supportEmail)}
                    title="Click to copy email"
                  >
                    {supportEmail}
                  </button>
                </div>

                {copiedText && (
                  <div className="vwFooterCopiedToast">
                    Copied
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="vwFooterBottom">
          <div className="vwFooterBottomLeft" />

          <div className="vwFooterCopy">
            ©2026 Flipspaces. All Rights Reserved.
          </div>

          <div className="vwFooterRightBrand">
            <a
              className="vwFooterFlipLink"
              href="https://www.flipspaces.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit Flipspaces website"
              title="Visit Flipspaces"
            >
              <img
                className="vwFooterFlipLogo"
                src={flipspacesLogo}
                alt="Flipspaces"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}