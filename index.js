import bridge from '@vkontakte/vk-bridge';
import '@vkontakte/vkui';
 
bridge.send("VKWebAppInit", {});

{
  "type": "VKWebAppGetAdsResult",
  "data": { ... }
}

{
    "type": "VKWebAppGetAdsFailed",
    "data": {
        "error_type": String
        "error_data": {}
    }
}

bridge.send('VKWebAppGetAds')
    .then((promoBannerProps) => {
        this.setState({ promoBannerProps });
    })
{ this.state.promoBannerProps && <PromoBanner bannerData={ this.state.promoBannerProps } /> }