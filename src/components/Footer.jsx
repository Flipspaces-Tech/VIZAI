import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../styles/footer.css";

import vizIcon from "../assets/L1.png";
import flipspacesLogo from "../assets/FL LOGO.png";

export default function Footer() {
  const [copied, setCopied] = useState(false);

  const supportPhone = "+91 82373 44185";
  const supportEmail = "nitesh.gaikwad@flipspaces.com";
  const supportText = `${supportPhone}\n${supportEmail}`;

  const handleCopySupport = async (e) => {
    e.preventDefault();

    try {
      await navigator.clipboard.writeText(supportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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
              <a className="vwFooterLink" href="/docs">
                FAQs
              </a>
              <a className="vwFooterLink" href="/shortcuts">
                Shortcut Guide
              </a>

              <div className="vwFooterSupportWrap">
              <button
                type="button"
                className="vwFooterLink vwFooterSupportBtn"
                onClick={handleCopySupport}
              >
                Contact Support
              </button>

              <div className="vwFooterSupportTooltip">
                <div>{supportPhone}</div>
                <div>{supportEmail}</div>
              </div>

              {copied && (
                <div className="vwFooterCopiedToast">Copied</div>
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