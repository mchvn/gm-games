// @flow

import * as React from "react";

class Footer extends React.Component<{}> {
    // eslint-disable-next-line class-methods-use-this
    shouldComponentUpdate() {
        return false;
    }

    // eslint-disable-next-line class-methods-use-this
    render() {
        return (
            <div>
                <div className="clearfix" />
                <hr />

                <footer>
                    <p>
                        <a
                            href="https://basketball-gm.com/about/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            About
                        </a>{" "}
                        ·{" "}
                        <a
                            href="https://basketball-gm.com/advertise/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Advertise
                        </a>{" "}
                        ·{" "}
                        <a
                            href="https://basketball-gm.com/blog/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Blog
                        </a>{" "}
                        ·{" "}
                        <a
                            href="https://basketball-gm.com/contact/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Contact
                        </a>{" "}
                        ·{" "}
                        <a
                            href="https://basketball-gm.com/privacy-policy/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Privacy Policy
                        </a>{" "}
                        ·{" "}
                        <a
                            href="https://basketball-gm.com/share/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Share
                        </a>
                        <br />
                    </p>
                    <p className="rev">
                        Component versions:<br />
                        {window.bbgmVersion} (HTML)<br />
                        {window.bbgmVersionUI} (UI)<br />
                        {window.bbgmVersionWorker} (Worker)
                    </p>
                </footer>
            </div>
        );
    }
}

export default Footer;
