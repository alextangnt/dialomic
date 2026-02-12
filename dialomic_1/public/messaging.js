let psg = "";
let psgName = "";
let allLinks;
let linksText = [];
let started = false;
let p5Origin = "";
let firstPassageSent = false;

window.onload = () =>{
    $(document).on(':passageend', function (ev) {
        
        /* Log details about the current moment. */
        psgName = ev.passage.name;
        // console.group('Details about the current moment');
        // console.log('buffer:', ev.detail);

        // console.groupEnd();
        
        psg = ev.detail.content.outerText;
        allLinks = document.querySelectorAll('a.link-internal');
        // console.log("links: ",allLinks);
        linksText = [];
        
        allLinks.forEach(function(node) {
            linksText.push(node.innerHTML);
        }
        );

        // console.log("linksText: ",linksText);
        let psgInfo = {psgName: psgName, passage: psg, links: linksText};

        if (!started){
            console.log("SugarCube is ready!");
            parent.postMessage({ type: "init", info: psgInfo}, window.location.origin);
            started = true;
        }
        else
            console.log("Sending passage back!");
            parent.postMessage({ type: "passage", info: psgInfo}, window.location.origin);
    });


    // $(document).one(':passageend', function (ev) {
    //     // console.log('passagŹ name:', ev.detail);
    //     console.log("SugarCube is ready!");


    //     /* Log details about the current moment. */
    //     psgName = ev.passage.name;
    //     // console.group('Details about the current moment');
    //     // console.log('buffer:', ev.detail);

    //     // console.groupEnd();
        
    //     psg = ev.detail.content.outerText;
    //     allLinks = document.querySelectorAll('a.link-internal');
    //     // console.log("links: ",allLinks);
    //     linksText = [];
        
    //     allLinks.forEach(function(node) {
    //         linksText.push(node.innerHTML);
    //     }
    //     );

    //     // console.log("linksText: ",linksText);
    //     let psgInfo = {psgName: psgName, passage: psg, links: linksText};


    //     parent.postMessage({ type: "init", info: psgInfo}, window.location.origin);
    //     // parent.postMessage({ type: "init"}, window.location.origin);

    //     // psgName = ev.passage.name;
    //     // psg = ev.detail.content.outerText;
    //     // window.postMessage({ type: "passage", psgName: psgName, passage: psg, links: linksText}, window.location.origin);
        
    // });

    window.addEventListener("message", function (event) {
        const { type, passage, clicked } = event.data;
        
        
        if (event.data.type === "ping") {
            event.source.postMessage({ type: "pong", status: "ready" }, event.origin);
            p5Origin = event.origin;
            
        }

        if (event.data.type === "start") {
            started = true;
            SugarCube.Engine.restart();
            // SugarCube.Engine.play(psgName);
            
        }
        if (event.data.type === "play") {

            SugarCube.Engine.play(passage);
            // SugarCubetriggerEvent('click', document.getElementById('some-menu'));
            
            console.log(SugarCube.State.variables);
            // event.source.postMessage({ type: "passage", passage: psg, links: linksText}, event.origin);
        }
        if (event.data.type === "click"){
            console.log(allLinks[clicked]);
            allLinks[clicked].click();
        }

    });
}

